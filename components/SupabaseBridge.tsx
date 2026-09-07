"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

/**
 * Exposes a Supabase browser client on window.__supabase so the legacy
 * vanilla-JS tree script (data/suggest.client.js) can call it directly —
 * it isn't a React tree, so it can't use a hook.
 */
export default function SupabaseBridge() {
  useEffect(() => {
    const supabase = createClient();
    // @ts-expect-error – deliberate global bridge for the non-React tree script
    window.__supabase = supabase;
    // Lets the tree script show admin-only controls (e.g. "Replace photo").
    // Since new sign-ups are disabled in Supabase, any logged-in session is
    // Faherah's — the actual write routes still re-check requireAdmin()
    // server-side, so this is a UI convenience, not the security boundary.
    supabase.auth.getSession().then(({ data }) => {
      // @ts-expect-error – deliberate global bridge
      window.__isAdmin = !!data.session;
    });
  }, []);
  return null;
}
