import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const KIND_LABEL: Record<string, string> = {
  edit_person: "an edit",
  add_child: "a new person (child)",
  add_partner: "a new person (partner)",
  upload_photo: "a photo",
};

/**
 * Fired (fire-and-forget, from the browser) right after a suggestion is
 * successfully inserted into Supabase. Not itself the source of truth —
 * the suggestions table is — so if this fails or someone spams it, nothing
 * about the data is at risk; worst case is a missed or bogus email.
 */
export async function POST(req: NextRequest) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    // Not configured yet — fail quietly, the suggestion itself already saved fine.
    return NextResponse.json({ ok: false, reason: "Email not configured." }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "other").slice(0, 40);
  const familyLabel = String(body.familyLabel || "").slice(0, 60);
  const personName = String(body.personName || "").slice(0, 200);
  const submittedName = String(body.submittedName || "Someone").slice(0, 200);
  const submittedNote = String(body.submittedNote || "").slice(0, 2000);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const subject = `New family tree suggestion: ${KIND_LABEL[kind] || kind}${personName ? " — " + personName : ""}`;
  const lines = [
    `${submittedName} suggested ${KIND_LABEL[kind] || kind}${familyLabel ? " on the " + familyLabel + " line" : ""}.`,
    personName ? `Person: ${personName}` : "",
    submittedNote ? `Note: ${submittedNote}` : "",
    "",
    "Review it in your admin dashboard.",
  ].filter(Boolean);

  try {
    await transporter.sendMail({
      from: `"Family Tree" <${gmailUser}>`,
      to: gmailUser,
      subject,
      text: lines.join("\n"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Email delivery failing should never surface as an error to the visitor.
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 200 });
  }
}
