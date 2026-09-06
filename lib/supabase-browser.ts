"use client";

import { createBrowserClient } from "@supabase/ssr";

// Used from client components: tree viewer, suggestion form, admin dashboard UI.
// Only ever uses the public anon/publishable key — safe to ship to the browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
