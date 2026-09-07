-- ============================================================================
-- Migration 02 — richer profiles + a real audit trail + new suggestion kinds
--
-- Your database already exists (you ran schema.sql once already), so this
-- file only adds what's new — it does NOT recreate anything, and it's safe
-- to run more than once.
--
-- HOW TO RUN THIS: Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run.
-- ============================================================================

-- New fields on each person: date of birth (free text — many dates in a
-- family tree are approximate, like "circa 1938", so a strict date column
-- would reject exactly the entries you're most likely to have), whether
-- they're living/deceased/unknown, and what they do/did.
alter table people add column if not exists dob text;
alter table people add column if not exists status text not null default 'unknown';
alter table people add column if not exists occupation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_status_check'
  ) then
    alter table people add constraint people_status_check
      check (status in ('living', 'deceased', 'unknown'));
  end if;
end $$;

-- Let a suggestion propose a brand-new partner for an existing person (not
-- just a new child), and record exactly what was applied when you approve
-- something — separate from `payload`, which is what was originally
-- submitted and might get edited before you approve it.
alter table suggestions add column if not exists applied_snapshot jsonb;

alter table suggestions drop constraint if exists suggestions_kind_check;
alter table suggestions add constraint suggestions_kind_check
  check (kind in ('edit_person', 'add_person', 'add_child', 'add_partner', 'add_union', 'upload_photo', 'other'));
