# Oppsett — steg for steg

Det meste er gjort i koden. Dette må eieren gjøre i dashboardene (ca. 20 minutter).

## 1. Vercel-prosjekt

1. vercel.com → **Add New → Project** → importer GitHub-repoet `Django641/familiesamarbeid`.
2. Framework: Next.js (oppdages automatisk). Ikke legg inn env-variabler ennå — trykk Deploy (første deploy kan feile, det er greit).
3. Under **Settings → Domains**: noter adressen (f.eks. `familiesamarbeid.vercel.app`) eller koble på et eget domene.

## 2. Database (Supabase via Vercel)

1. I prosjektet: **Storage → Create Database → Supabase** (Marketplace). Velg region **Frankfurt (eu-central-1)** hvis du får valget, og gratisplanen holder.
2. Koble databasen til prosjektet for alle miljøer. Vercel legger da inn disse automatisk:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (+ `POSTGRES_*` som appen ikke bruker).
3. Åpne Supabase-dashboardet (knapp i Vercel) → **SQL Editor** → lim inn hele `supabase/migrations/0001_init.sql` → **Run**.
4. **Authentication → URL Configuration:** Site URL = `https://<din-adresse>`; Redirect URLs: `https://<din-adresse>/**`.
5. **Authentication → Sign In / Providers → Email:** «Confirm email» på.
   (Valgfritt: egen SMTP via Resend, som i Hyttekompis, for penere avsender.)

### Kjørte migrasjoner

| Fil | Kjørt i prod |
|---|---|
| `0001_init.sql` | ☐ |

## 3. Miljøvariabler i Vercel

**Settings → Environment Variables** (Production + Preview). Navn må være nøyaktig slik:

| Navn | Verdi | Påkrevd |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://<din-adresse>` (uten skråstrek til slutt) | Ja |
| `CRON_SECRET` | En lang tilfeldig streng (f.eks. fra `openssl rand -hex 32`) | Ja, for kalenderimport |
| `ANTHROPIC_API_KEY` | Samme nøkkel som i Hyttekompis (console.anthropic.com) | For AI-sortering og «Fra tekst» |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Fra `npx web-push generate-vapid-keys` | For push |
| `VAPID_PRIVATE_KEY` | Fra samme kommando | For push |
| `VAPID_SUBJECT` | `mailto:<din e-post>` | For push |

Etter endringer: **Deployments → Redeploy** (`NEXT_PUBLIC_*` bakes inn ved build).

`OPENAI_API_KEY` trengs ikke nå. Blir det aktuelt, heter variabelen `OPENAI_API_KEY`.

## 4. Ta appen i bruk

1. Åpne adressen på iPhone i Safari → lag konto → bekreft e-post → «Ny familie» (legg inn Ada og Lea).
2. **Del → Legg til på Hjem-skjerm**, og åpne appen derfra.
3. Innstillinger → **Inviter samboeren din** → send lenken.
4. Innstillinger → **Push-varsler** på begge telefoner.
5. Innstillinger → **Familiekalenderen i Outlook** → lag lenke → legg den inn i Outlook (Kalender → Legg til kalender → Abonner fra nettet).

## 5. Spond inn i kalenderen

Spond har ingen offentlig kalenderlenke, men kan synke til kalenderen på telefonen:

1. Lag en Google-kalender «Barna» (calendar.google.com på PC → Andre kalendere → Opprett ny kalender). Del den med samboeren.
2. iPhone: legg til Google-kontoen under Innstillinger → Kalender → Kontoer.
3. Spond-appen: slå på kalendersynkronisering og velg «Barna».
4. Google Kalender (PC) → Innstillinger for «Barna» → **Hemmelig adresse i iCal-format** → kopier.
5. Appen: Innstillinger → **Importer kalendere** → Legg til → lim inn, velg «Aktivitet/fritid» og Ada/Lea.

Spond-hendelser dukker da opp i appen innen 30 minutter, og videre i Outlook via abonnementet.
