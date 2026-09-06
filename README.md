# Abu Bakar, Kuddus & Maricar — Family Tree

The live, editable version of the family tree dashboard. Anyone can view it and suggest an
edit or upload a photo; only Faherah can sign in and approve changes.

## What this is

- **Public site (`/`)** — the same tree viewer (pan/zoom/search) as the original preview,
  now reading its data from a database instead of being hardcoded. Every person's "Suggest
  an edit" and "Upload photo" buttons actually work now — they save into a `suggestions`
  table for review.
- **Admin dashboard (`/admin`)** — sign in with Faherah's own account to see every pending
  suggestion, edit the details if needed, and approve or reject it. Approving an edit to an
  existing person, or a photo, applies it immediately. Approving a suggestion to add a new
  person or couple records the decision, but — because getting a family tree's structure
  wrong is easy and has happened before — it doesn't try to auto-apply structural changes;
  see "Adding a new person or couple" below.

## One-time setup

### 1. Create the Supabase project (if you haven't already)

Go to [supabase.com/dashboard](https://supabase.com/dashboard) → New Project. Pick a name,
region, and database password (save the password somewhere safe).

### 2. Run the database schema

In your Supabase project: **SQL Editor** → New query → paste the entire contents of
[`supabase/schema.sql`](./supabase/schema.sql) → Run. This creates the `people`, `unions`,
`union_children`, and `suggestions` tables, sets up the security rules, and creates a public
`photos` storage bucket.

### 3. Seed the current tree

Same place — **SQL Editor** → New query → paste the entire contents of
[`supabase/seed.sql`](./supabase/seed.sql) → Run. This loads the exact 264 people and their
relationships from the tree as it stands today (generated straight from the verified data,
so nothing was retyped by hand). Safe to re-run.

### 4. Create your admin account and lock out sign-ups

- **Authentication → Users → Add user** → create yourself an account with your email and a
  password you'll remember. Use "Auto Confirm User" so you don't need to click an email link.
- **Authentication → Settings** (previously "Providers") → turn **off** "Allow new users to
  sign up". This is what makes you the only possible admin — nobody else can ever create an
  account, so "authenticated" only ever means you.

### 5. Get your API keys

**Settings → API Keys** in the Supabase dashboard. You'll need three values for the next
step — see `.env.example` for exactly which ones and what they're called (Supabase is
mid-rename from "anon/service_role" to "publishable/secret"; either naming works).

### 6. Push this project to GitHub

This project is ready to push as-is — I couldn't push it for you directly (no GitHub access
from here), so from a terminal in this folder:

```bash
git init
git add .
git commit -m "Family tree app: viewer, suggestions, admin approval"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

(Create the empty repo on GitHub first — github.com/new — then use the URL it gives you.)

### 7. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo you just pushed.
2. Before clicking Deploy, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable/anon key — safe to expose)
   - `SUPABASE_SERVICE_ROLE_KEY` (the secret/service_role key — **never** put this in a
     `NEXT_PUBLIC_*` variable or commit it to git)
   - `ADMIN_EMAIL` — the exact email address of the account you made in step 4
3. Click **Deploy**. From now on, every push to `main` redeploys automatically.

That's it — the link Vercel gives you is the new live dashboard, free forever on the Hobby
plan.

## Local development

```bash
cp .env.example .env.local   # then fill in the four values from step 5
npm install
npm run dev
```

## Adding a new person or couple

The admin dashboard's "Approve" button on a structural suggestion (add a person, add a
couple, add a child) just records that it should happen — it doesn't try to guess where a
new person belongs in the tree. To actually add one, open **Table Editor** in Supabase and
insert rows the same way `supabase/seed.sql` does:

- A row in `people` (pick a unique `id`, e.g. `abubakar_new_person`).
- A row in `unions` if they're joining as someone's partner (`partner1_id`/`partner2_id`).
- A row in `union_children` for each child, linking a `union_id` to a `child_id`.

If that feels fiddly, it's exactly the kind of change that's easy to get subtly wrong in a
tree this tangled — sending me (Claude) the suggestion, the way tree updates have worked so
far, is a safe fallback.

## Re-syncing from a new PDF export

If the master family tree PDF changes again, the cleanest path is still: send it to Claude,
which can diff it against what's live, verify the changes pixel-by-pixel against the PDF (as
has been done for every update so far), and either update the original preview file or write
the equivalent SQL to update this database directly.

## Project structure

```
app/
  page.tsx                 the public tree (fetches data, renders TreeApp)
  admin/login/page.tsx      sign-in form
  admin/page.tsx            approval dashboard (server-side auth check)
  api/suggestions/resolve/  approve/reject endpoint (service_role key, admin-only)
components/
  TreeApp.tsx               stitches together the legacy CSS/HTML/JS tree renderer
  SupabaseBridge.tsx        exposes a Supabase client to that legacy JS
  SuggestionsDashboard.tsx  the admin UI
data/
  tree.css / tree.body.html / tree.script.js   the original verified tree renderer,
                                                 lightly adapted to read live data
  suggest.client.js         wires the "Suggest an edit" / "Upload photo" buttons
lib/
  supabase-browser.ts / supabase-server.ts / supabase-admin.ts   the three Supabase
    clients (public, request-scoped, and service-role — see comments in each file)
  auth.ts                   requireAdmin() — the single admin check every write uses
  tree-data.ts              loads the tree from Supabase, falls back to the bundled
                             seed JSON if the database isn't reachable yet
supabase/
  schema.sql                run this first, once
  seed.sql                  then this, once
  tree-data.json            the extracted verified data seed.sql was generated from
```

## A note on security

Only two things are allowed to write to the `people`/`unions`/`union_children` tables at
all: the SQL you run by hand in Supabase, and the `/api/suggestions/resolve` route, which
checks `requireAdmin()` (must be signed in as `ADMIN_EMAIL`) before touching anything. The
public anon key that ships to every visitor's browser can only ever read the tree and insert
new rows into `suggestions` — it has no permission to change existing data, by database rule
(Row Level Security), not just by the app choosing not to ask.
