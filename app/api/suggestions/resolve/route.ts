import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof createAdminClient>;

const EDITABLE_PERSON_FIELDS = ["name", "title", "traits", "dob", "status", "occupation"] as const;

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "person"
  );
}

/** Picks a person id that doesn't collide with anything already in the table. */
async function uniquePersonId(admin: Admin, family: string, name: string) {
  const base = `${family}_${slugify(name)}`;
  let candidate = base;
  let n = 2;
  // Small table, small loop — a handful of round-trips at most in practice.
  for (;;) {
    const { data } = await admin.from("people").select("id").eq("id", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}_${n++}`;
  }
}

function newPersonPatch(fields: Record<string, unknown> | undefined) {
  const patch: Record<string, unknown> = {};
  EDITABLE_PERSON_FIELDS.forEach((k) => {
    if (typeof fields?.[k] === "string" && fields[k]) patch[k] = fields[k];
  });
  return patch;
}

/**
 * The single write path for turning a suggestion into an actual tree change.
 * Every branch here runs with the service_role key (bypasses RLS) — that's
 * safe ONLY because requireAdmin() has already confirmed the caller is
 * signed in as Faherah's own account. Nothing else in this app can write to
 * people/unions/union_children. Every approve also writes `applied_snapshot`
 * — exactly what got created/changed — so there's always a durable record of
 * what was suggested, what was actually applied, and when.
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

  let appliedSnapshot: Record<string, unknown> | null = null;

  if (action === "approve") {
    // ---- Edit an existing person's fields ----
    if (suggestion.kind === "edit_person" && suggestion.target_person_id && editedFields) {
      const patch = newPersonPatch(editedFields);
      const { error } = await admin
        .from("people")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", suggestion.target_person_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      appliedSnapshot = { type: "edit_person", person_id: suggestion.target_person_id, fields: patch };
    }

    // ---- Promote a pending photo to a person's live photo ----
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
        appliedSnapshot = { type: "upload_photo", person_id: suggestion.target_person_id, photo_url: pub.publicUrl };
      }
    }

    // ---- Add a brand-new child under two existing parents ----
    if (suggestion.kind === "add_child") {
      const family = suggestion.family as string;
      const parent1 = suggestion.payload?.parent1_id as string | undefined;
      const parent2 = (suggestion.payload?.parent2_id as string | undefined) || null;
      const newFields = { ...(suggestion.payload?.new_person || {}), ...(editedFields || {}) };
      if (!family || !parent1 || !newFields.name || !newFields.gender) {
        return NextResponse.json({ error: "This suggestion is missing required fields." }, { status: 400 });
      }
      const { data: parentRow, error: parentErr } = await admin
        .from("people")
        .select("gen")
        .eq("id", parent1)
        .single();
      if (parentErr || !parentRow) {
        return NextResponse.json({ error: "The listed parent no longer exists." }, { status: 400 });
      }
      const newId = await uniquePersonId(admin, family, newFields.name);
      const patch = newPersonPatch(newFields);
      const { error: insertErr } = await admin.from("people").insert({
        id: newId,
        family,
        gender: newFields.gender,
        gen: parentRow.gen + 1,
        ...patch,
      });
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

      // Reuse the parents' existing union if there is one, else create one.
      let unionId: string;
      const { data: existingUnion } = await admin
        .from("unions")
        .select("id")
        .eq("family", family)
        .or(
          parent2
            ? `and(partner1_id.eq.${parent1},partner2_id.eq.${parent2}),and(partner1_id.eq.${parent2},partner2_id.eq.${parent1})`
            : `partner1_id.eq.${parent1},partner2_id.eq.${parent1}`
        )
        .maybeSingle();
      if (existingUnion) {
        unionId = existingUnion.id;
      } else {
        unionId = `${family}_u_${Date.now().toString(36)}`;
        const { error: unionErr } = await admin
          .from("unions")
          .insert({ id: unionId, family, partner1_id: parent1, partner2_id: parent2 });
        if (unionErr) return NextResponse.json({ error: unionErr.message }, { status: 500 });
      }
      const { count } = await admin
        .from("union_children")
        .select("*", { count: "exact", head: true })
        .eq("union_id", unionId);
      const { error: childErr } = await admin
        .from("union_children")
        .insert({ union_id: unionId, child_id: newId, position: count || 0 });
      if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 });

      appliedSnapshot = { type: "add_child", person_id: newId, union_id: unionId, gen: parentRow.gen + 1 };
    }

    // ---- Add a brand-new partner for an existing person ----
    if (suggestion.kind === "add_partner") {
      const family = suggestion.family as string;
      const existingId = suggestion.payload?.existing_person_id as string | undefined;
      const newFields = { ...(suggestion.payload?.new_person || {}), ...(editedFields || {}) };
      if (!family || !existingId || !newFields.name || !newFields.gender) {
        return NextResponse.json({ error: "This suggestion is missing required fields." }, { status: 400 });
      }
      const { data: existingRow, error: existingErr } = await admin
        .from("people")
        .select("gen")
        .eq("id", existingId)
        .single();
      if (existingErr || !existingRow) {
        return NextResponse.json({ error: "That person no longer exists." }, { status: 400 });
      }
      const newId = await uniquePersonId(admin, family, newFields.name);
      const patch = newPersonPatch(newFields);
      const { error: insertErr } = await admin.from("people").insert({
        id: newId,
        family,
        name: newFields.name,
        gender: newFields.gender,
        gen: existingRow.gen,
        ...patch,
      });
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

      const unionId = `${family}_u_${Date.now().toString(36)}`;
      const { error: unionErr } = await admin
        .from("unions")
        .insert({ id: unionId, family, partner1_id: existingId, partner2_id: newId });
      if (unionErr) return NextResponse.json({ error: unionErr.message }, { status: 500 });

      appliedSnapshot = { type: "add_partner", person_id: newId, union_id: unionId, gen: existingRow.gen };
    }
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
      applied_snapshot: appliedSnapshot,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, appliedSnapshot });
}
