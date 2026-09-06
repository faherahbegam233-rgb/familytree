import { createClient } from "@/lib/supabase-server";

/**
 * Confirms the current request is authenticated AND the logged-in user's
 * email matches ADMIN_EMAIL. This is the single choke point for "only I can
 * approve/apply changes" — every write route calls this first.
 *
 * Belt-and-suspenders: Supabase Auth sign-ups are also disabled in the
 * dashboard (Authentication > Settings > "Allow new users to sign up" OFF),
 * and only Faherah's own account should exist, so in practice any
 * authenticated user already is the admin. Checking the email here means
 * that stays true even if that setting is ever changed by mistake.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false as const, status: 401, message: "Not signed in." };
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!adminEmail) {
    return {
      ok: false as const,
      status: 500,
      message: "ADMIN_EMAIL is not configured on the server.",
    };
  }

  if (user.email.toLowerCase().trim() !== adminEmail) {
    return { ok: false as const, status: 403, message: "Not the admin account." };
  }

  return { ok: true as const, user };
}
