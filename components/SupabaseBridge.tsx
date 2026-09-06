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
    // @ts-expect-error – deliberate global bridge for the non-React tree script
    window.__supabase = createClient();
  }, []);
  return null;
}
