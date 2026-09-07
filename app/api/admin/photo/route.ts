import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Lets the signed-in admin replace any person's photo immediately — no
 * suggestion, no approval step. Still gated by requireAdmin(), so this is
 * only ever reachable when Faherah is logged in.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const form = await req.formData();
  const pid = form.get("pid");
  const file = form.get("file");
  if (typeof pid !== "string" || !pid || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing person id or file." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: person, error: personErr } = await admin.from("people").select("id").eq("id", pid).maybeSingle();
  if (personErr || !person) return NextResponse.json({ error: "Person not found." }, { status: 404 });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `people/${pid}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("photos")
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: true });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from("photos").getPublicUrl(path);
  // Cache-bust: the browser (and other viewers) may have the old file cached
  // under this same URL, since upsert reuses the same path.
  const photoUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await admin
    .from("people")
    .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
    .eq("id", pid);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, photoUrl });
}
