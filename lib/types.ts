// Radtyper som speiler supabase/migrations. Oppdater når skjemaet endres.

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Person = {
  id: string;
  household_id: string;
  name: string;
  kind: "voksen" | "barn";
  color: string;
  user_id: string | null;
  position: number;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  starts_at: string;
  /** For heldagshendelser: start av siste dag (inklusiv). Null = samme dag / ingen slutt. */
  ends_at: string | null;
  all_day: boolean;
  person_ids: string[];
  series_id: string | null;
  source: "manual" | "ics";
  external_calendar_id: string | null;
  external_uid: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalCalendar = {
  id: string;
  household_id: string;
  name: string;
  url: string;
  category: string;
  person_ids: string[];
  last_synced_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShoppingStatus = "ma_kjopes" | "kjopt";

export type ShoppingItem = {
  id: string;
  household_id: string;
  name: string;
  category: string | null; // "dagligvare" | "annet"
  store: string | null;
  status: ShoppingStatus;
  comment: string | null;
  sort_order: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  household_id: string;
  title: string;
  notes: string | null;
  assignee_person_id: string | null;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  household_id: string;
  body: string;
  important: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  household_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: string;
  created_by: string | null;
  created_at: string;
};
