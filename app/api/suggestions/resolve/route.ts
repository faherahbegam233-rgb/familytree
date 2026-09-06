import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * The single write path for turning a suggestion into an actual tree change.
 * Every branch here runs with the service_role key (bypasses RLS) — that's
 * safe ONLY because requireAdmin() has already confirmed the caller is
 * signed in as Faherah's own account. Nothing else in this app can write to
 * people/unions/union_children.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = await req.json();
  const { id, action, adminNote, editedFields } = body as {
    id: string;
    action: "approve" | "reject";
    adminNote?: string;
    editedFields?: Record<string, string>;
  };
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Missing or invalid id/action." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: suggestion, error: fetchErr } = await admin
    .from("suggestions")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }
  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: "This suggestion was already resolved." }, { status: 409 });
  }

  if (action === "approve") {
    if (suggestion.kind === "edit_person" && suggestion.target_person_id && editedFields) {
      const allowed = ["name", "title", "traits"] as const;
      const patch: Record<string, string> = {};
      allowed.forEach((k) => {
        if (typeof editedFields[k] === "string") patch[k] = editedFields[k];
      });
      const { error } = await admin
        .from("people")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", suggestion.target_person_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (suggestion.kind === "upload_photo" && suggestion.target_person_id) {
      const pendingPath = suggestion.payload?.storage_path as string | undefined;
      if (pendingPath) {
        const ext = pendingPath.split(".").pop() || "jpg";
        const finalPath = `people/${suggestion.target_person_id}.${ext}`;
        const { error: copyErr } = await admin.storage.from("photos").copy(pendingPath, finalPath);
        if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 500 });
        await admin.storage.from("photos").remove([pendingPath]);
        const { data: pub } = admin.storage.from("photos").getPublicUrl(finalPath);
        const { error: updateErr } = await admin
          .from("people")
          .update({ photo_url: pub.publicUrl, updated_at: new Date().toISOString() })
          .eq("id", suggestion.target_person_id);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }
    // add_person / add_union / add_child / other: approving records the
    // decision; because these change the tree's *structure* rather than one
    // field, applying them still means adding a row by hand (Supabase Table
    // Editor, or the same SQL pattern as supabase/seed.sql) — see README.
  }

  if (suggestion.kind === "upload_photo" && action === "reject") {
    const pendingPath = suggestion.payload?.storage_path as string | undefined;
    if (pendingPath) await admin.storage.from("photos").remove([pendingPath]);
  }

  const { error: statusErr } = await admin
    .from("suggestions")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      admin_note: adminNote || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
