import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Used from server components / route handlers acting AS the logged-in visitor
// (respects Row Level Security — can read the tree, insert suggestions, but
// cannot write directly to people/unions).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no request context to write to.
            // Safe to ignore as long as middleware refreshes the session.
          }
        },
      },
    }
  );
}
