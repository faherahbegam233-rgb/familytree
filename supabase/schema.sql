-- ============================================================================
-- Family Tree app — database schema
--
-- HOW TO RUN THIS:
-- 1. Open your project at supabase.com/dashboard
-- 2. Left sidebar -> SQL Editor -> "New query"
-- 3. Paste this entire file and click "Run"
-- It's safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP..CREATE.
-- ============================================================================

-- ---------- People ----------
create table if not exists people (
  id text primary key,
  family text not null check (family in ('abubakar', 'kuddus', 'maricar')),
  name text not null,
  gender text not null check (gender in ('m', 'f', 'u')),
  gen int not null,
  title text,
  traits text,
  unknown boolean not null default false,
  is_user boolean not null default false,
  photo_url text,
  dob text,
  status text not null default 'unknown' check (status in ('living', 'deceased', 'unknown')),
  occupation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Unions (couples) ----------
create table if not exists unions (
  id text primary key,
  family text not null check (family in ('abubakar', 'kuddus', 'maricar')),
  partner1_id text not null references people(id) on delete cascade,
  partner2_id text references people(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Children of a union (ordered) ----------
create table if not exists union_children (
  union_id text not null references unions(id) on delete cascade,
  child_id text not null references people(id) on delete cascade,
  position int not null default 0,
  primary key (union_id, child_id)
);

-- ---------- Suggested edits, awaiting Faherah's approval ----------
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  family text check (family in ('abubakar', 'kuddus', 'maricar')),
  kind text not null check (
    kind in ('edit_person', 'add_person', 'add_child', 'add_partner', 'add_union', 'upload_photo', 'other')
  ),
  target_person_id text references people(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  submitted_name text,
  submitted_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  -- Exactly what was written to people/unions/union_children when this was
  -- approved (new ids created, fields changed) — the permanent audit trail,
  -- separate from `payload` (what was originally submitted).
  applied_snapshot jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists suggestions_status_idx on suggestions (status, created_at desc);

-- ============================================================================
-- Row Level Security
--
-- Rule of thumb: anyone (even not logged in) can READ the tree and SUBMIT a
-- suggestion. Only an authenticated user can read/resolve suggestions or
-- touch people/unions directly — and since new sign-ups are disabled in
-- Authentication settings, "authenticated" only ever means Faherah.
-- ============================================================================

alter table people enable row level security;
alter table unions enable row level security;
alter table union_children enable row level security;
alter table suggestions enable row level security;

drop policy if exists "people readable by everyone" on people;
create policy "people readable by everyone" on people
  for select using (true);

drop policy if exists "unions readable by everyone" on unions;
create policy "unions readable by everyone" on unions
  for select using (true);

drop policy if exists "union_children readable by everyone" on union_children;
create policy "union_children readable by everyone" on union_children
  for select using (true);

-- No insert/update/delete policies on people/unions/union_children for the
-- anon or authenticated roles: all writes to the tree itself go through the
-- server-side approval route, which uses the service_role key and therefore
-- bypasses RLS entirely. This is what makes "only I can apply changes" true
-- even if someone found the anon key.

drop policy if exists "anyone can submit a suggestion" on suggestions;
create policy "anyone can submit a suggestion" on suggestions
  for insert with check (status = 'pending');

drop policy if exists "admin can read suggestions" on suggestions;
create policy "admin can read suggestions" on suggestions
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin can resolve suggestions" on suggestions;
create policy "admin can resolve suggestions" on suggestions
  for update using (auth.role() = 'authenticated');

-- ============================================================================
-- Storage: a public "photos" bucket.
-- Visitors suggesting a photo upload into pending/<suggestion-id>/..., the
-- admin dashboard promotes the file to people/<person-id>/... on approval.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos are publicly viewable" on storage.objects;
create policy "photos are publicly viewable" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "anyone can upload a pending photo" on storage.objects;
create policy "anyone can upload a pending photo" on storage.objects
  for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'pending');

drop policy if exists "admin can manage all photos" on storage.objects;
create policy "admin can manage all photos" on storage.objects
  for all using (bucket_id = 'photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');
