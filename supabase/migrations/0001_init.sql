-- Familiesamarbeid – første migrasjon: hele grunnskjemaet + RLS + storage + realtime.
--
-- Kjør HELE filen én gang i Supabase → SQL Editor på et nytt prosjekt.
-- Senere endringer legges som nye, nummererte filer (0002_*.sql osv.) og kjøres
-- i rekkefølge. Rediger aldri en migrasjon som allerede er kjørt.
--
-- Prinsipp: all data tilhører en husstand (household_id). En innlogget bruker
-- kan bare lese/skrive rader i en husstand hen er medlem av
-- (public.is_household_member). Medlemskap skrives KUN via SECURITY DEFINER-
-- funksjonene create_household_with_owner og join_household_by_code.

-- =====================================================================
-- Hjelpere
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- profiles – 1:1 med auth.users
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- households – husstanden (i praksis én: oss to + barna)
-- =====================================================================
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on public.household_members(user_id);

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

-- =====================================================================
-- people – familiemedlemmer (voksne med konto + barn uten konto).
-- Brukes til «hvem gjelder det» på hendelser og oppgaver.
-- =====================================================================
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null default 'barn' check (kind in ('voksen', 'barn')),
  color text not null default '#2563eb',
  user_id uuid references auth.users(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create index if not exists people_household_idx on public.people(household_id, position);

-- =====================================================================
-- external_calendars – ICS-abonnementer som importeres (Spond via Google,
-- skole, jobb …). Synkes av /api/cron/sync-calendars.
-- =====================================================================
create table if not exists public.external_calendars (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  url text not null check (url ~* '^(https|webcal)://'),
  category text not null default 'aktivitet',
  person_ids uuid[] not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- events – den delte kalenderen
-- =====================================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  location text,
  category text not null default 'avtale'
    check (category in ('avtale', 'reise', 'jobb', 'skole', 'aktivitet', 'bursdag', 'annet')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  person_ids uuid[] not null default '{}',
  series_id uuid,                 -- satt når hendelsen ble laget som «gjenta ukentlig»
  source text not null default 'manual' check (source in ('manual', 'ics')),
  external_calendar_id uuid references public.external_calendars(id) on delete cascade,
  external_uid text,              -- UID + RECURRENCE-ID fra ICS, for upsert
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_calendar_id, external_uid)
);

create index if not exists events_household_start_idx on public.events(household_id, starts_at);
create index if not exists events_series_idx on public.events(series_id) where series_id is not null;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- =====================================================================
-- calendar_feeds – hemmelig token per bruker for ICS-abonnement
-- (Outlook/Google/iPhone abonnerer på /api/ics/<token>).
-- =====================================================================
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- =====================================================================
-- shopping_items – handleliste (portert fra Hyttekompis, se docs/HANDLELISTE.md)
-- =====================================================================
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text,                       -- 'dagligvare' | 'annet'
  store text,                          -- valgfri butikk for 'annet'
  status text not null default 'ma_kjopes' check (status in ('ma_kjopes', 'kjopt')),
  comment text,
  sort_order double precision,         -- AI-butikkrekkefølge; null = usortert (sist)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_household_idx on public.shopping_items(household_id, status);

drop trigger if exists shopping_items_set_updated_at on public.shopping_items;
create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- =====================================================================
-- tasks – gjøremål
-- =====================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  notes text,
  assignee_person_id uuid references public.people(id) on delete set null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_household_idx on public.tasks(household_id, done);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- =====================================================================
-- messages – beskjeder mellom oss
-- =====================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  body text not null,
  important boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_household_idx on public.messages(household_id, created_at desc);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- =====================================================================
-- documents – metadata for filer i privat bucket 'family-files'
-- Sti: <household_id>/<uuid>-<filnavn>
-- =====================================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  category text not null default 'annet',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists documents_household_idx on public.documents(household_id, created_at desc);

-- =====================================================================
-- push_subscriptions – web push per enhet
-- =====================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_household_idx on public.push_subscriptions(household_id);

-- =====================================================================
-- RPC: opprett husstand + medlemskap + personer
-- =====================================================================
create or replace function public.create_household_with_owner(
  p_name text,
  p_display_name text,
  p_children text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_code text;
  v_child text;
  v_pos int := 1;
  v_colors text[] := array['#db2777', '#b45309', '#7c3aed', '#0e7490'];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'Du er allerede med i en familie';
  end if;

  -- 12 tegn (48 bit) — umulig å gjette, også med anon-tilgang til household_invite_info.
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.households (name, invite_code, created_by)
  values (p_name, v_code, auth.uid())
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'owner');

  update public.profiles set display_name = p_display_name where id = auth.uid();

  insert into public.people (household_id, name, kind, color, user_id, position)
  values (v_household_id, p_display_name, 'voksen', '#2563eb', auth.uid(), 0);

  foreach v_child in array coalesce(p_children, '{}') loop
    if length(trim(v_child)) > 0 then
      insert into public.people (household_id, name, kind, color, position)
      values (v_household_id, trim(v_child), 'barn', v_colors[1 + ((v_pos - 1) % 4)], 10 + v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;

  return v_household_id;
end;
$$;

-- Offentlig info for /bli-med/<kode> (kun navn — ingen sensitiv info)
create or replace function public.household_invite_info(p_code text)
returns table(household_id uuid, name text, inviter_name text)
language sql
security definer
set search_path = public
stable
as $$
  select h.id, h.name, coalesce(p.display_name, 'Noen')
  from public.households h
  left join public.profiles p on p.id = h.created_by
  where h.invite_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
$$;

grant execute on function public.household_invite_info(text) to anon, authenticated;

create or replace function public.join_household_by_code(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_household_id is null then
    raise exception 'Ugyldig invitasjonskode';
  end if;

  if exists (
    select 1 from public.household_members
    where user_id = auth.uid() and household_id <> v_household_id
  ) then
    raise exception 'Du er allerede med i en annen familie';
  end if;

  -- Appen er for to voksne. En lekket kode gir ikke tilgang når familien er full.
  if (select count(*) from public.household_members where household_id = v_household_id) >= 2
     and not exists (
       select 1 from public.household_members
       where household_id = v_household_id and user_id = auth.uid()
     ) then
    raise exception 'Familien er full';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.profiles set display_name = p_display_name where id = auth.uid();

  insert into public.people (household_id, name, kind, color, user_id, position)
  values (v_household_id, p_display_name, 'voksen', '#15803d', auth.uid(), 1)
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

-- =====================================================================
-- Rettigheter for Data API (RLS under avgjør hvilke rader som er synlige).
-- Nyere Supabase-prosjekter gir ikke alltid disse automatisk.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on function public.create_household_with_owner(text, text, text[]) from public, anon;
revoke execute on function public.join_household_by_code(text, text) from public, anon;
grant execute on function public.create_household_with_owner(text, text, text[]) to authenticated;
grant execute on function public.join_household_by_code(text, text) to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.people              enable row level security;
alter table public.external_calendars  enable row level security;
alter table public.events              enable row level security;
alter table public.calendar_feeds      enable row level security;
alter table public.shopping_items      enable row level security;
alter table public.tasks               enable row level security;
alter table public.messages            enable row level security;
alter table public.documents           enable row level security;
alter table public.push_subscriptions  enable row level security;

-- profiles: se seg selv + andre i samme husstand; skriv kun egen
drop policy if exists "profiles: select" on public.profiles;
create policy "profiles: select" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members me
      join public.household_members other on other.household_id = me.household_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- households: medlemmer leser og kan endre navn
drop policy if exists "households: select member" on public.households;
create policy "households: select member" on public.households
  for select using (public.is_household_member(id));

drop policy if exists "households: update member" on public.households;
create policy "households: update member" on public.households
  for update using (public.is_household_member(id)) with check (public.is_household_member(id));

-- household_members: se egne + samme husstand (skriving kun via RPC)
drop policy if exists "household_members: select" on public.household_members;
create policy "household_members: select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));

-- Data-tabeller: medlem leser/skriver alt i egen husstand
drop policy if exists "people: member rw" on public.people;
create policy "people: member rw" on public.people
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "external_calendars: member rw" on public.external_calendars;
create policy "external_calendars: member rw" on public.external_calendars
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "events: member rw" on public.events;
create policy "events: member rw" on public.events
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "shopping_items: member rw" on public.shopping_items;
create policy "shopping_items: member rw" on public.shopping_items
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "tasks: member rw" on public.tasks;
create policy "tasks: member rw" on public.tasks
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "messages: member rw" on public.messages;
create policy "messages: member rw" on public.messages
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "documents: member rw" on public.documents;
create policy "documents: member rw" on public.documents
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- calendar_feeds + push_subscriptions: kun egne rader
drop policy if exists "calendar_feeds: own" on public.calendar_feeds;
create policy "calendar_feeds: own" on public.calendar_feeds
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

drop policy if exists "push_subscriptions: own" on public.push_subscriptions;
create policy "push_subscriptions: own" on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- =====================================================================
-- Storage: privat bucket 'family-files', sti-prefiks = household_id
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('family-files', 'family-files', false)
on conflict (id) do nothing;

drop policy if exists "family-files: select" on storage.objects;
create policy "family-files: select" on storage.objects
  for select using (
    bucket_id = 'family-files'
    and public.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

drop policy if exists "family-files: insert" on storage.objects;
create policy "family-files: insert" on storage.objects
  for insert with check (
    bucket_id = 'family-files'
    and public.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

drop policy if exists "family-files: delete" on storage.objects;
create policy "family-files: delete" on storage.objects
  for delete using (
    bucket_id = 'family-files'
    and public.is_household_member((string_to_array(name, '/'))[1]::uuid)
  );

-- =====================================================================
-- Realtime: live-synk mellom telefonene
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['events', 'shopping_items', 'tasks', 'messages', 'documents', 'people', 'external_calendars'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
