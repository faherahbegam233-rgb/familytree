"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Suggestion = {
  id: string;
  family: string | null;
  kind: string;
  target_person_id: string | null;
  payload: Record<string, any>;
  submitted_name: string | null;
  submitted_note: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

const KIND_LABEL: Record<string, string> = {
  edit_person: "Edit existing person",
  add_person: "Add a person",
  add_union: "Add a couple",
  add_child: "Add a child",
  upload_photo: "Photo upload",
  other: "Other",
};

export default function SuggestionsDashboard({
  adminEmail,
  suggestions,
  photoUrls,
  peopleById,
}: {
  adminEmail: string;
  suggestions: Suggestion[];
  photoUrls: Record<string, string>;
  peopleById: Record<string, any>;
}) {
  const router = useRouter();
  const [list, setList] = useState(suggestions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { name: string; title: string; traits: string }>>({});

  const pending = useMemo(() => list.filter((s) => s.status === "pending"), [list]);
  const resolved = useMemo(() => list.filter((s) => s.status !== "pending"), [list]);

  function draftFor(s: Suggestion) {
    if (drafts[s.id]) return drafts[s.id];
    const p = s.target_person_id ? peopleById[s.target_person_id] : null;
    return { name: p?.name || "", title: p?.title || "", traits: p?.traits || "" };
  }

  async function resolve(s: Suggestion, action: "approve" | "reject") {
    setBusyId(s.id);
    const editedFields = s.kind === "edit_person" ? draftFor(s) : undefined;
    const res = await fetch("/api/suggestions/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, action, editedFields }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Something went wrong.");
      return;
    }
    setList((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, status: action === "approve" ? "approved" : "rejected" } : x))
    );
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>Suggested edits</h1>
          <p style={styles.sub}>Signed in as {adminEmail}</p>
        </div>
        <div>
          <a href="/" style={styles.linkBtn}>
            View the tree
          </a>
          <button onClick={signOut} style={styles.linkBtn}>
            Sign out
          </button>
        </div>
      </div>

      <h2 style={styles.h2}>Pending ({pending.length})</h2>
      {pending.length === 0 && <p style={styles.empty}>Nothing waiting on you right now.</p>}
      {pending.map((s) => (
        <div key={s.id} style={styles.card}>
          <div style={styles.cardTop}>
            <span style={styles.badge}>{KIND_LABEL[s.kind] || s.kind}</span>
            <span style={styles.meta}>
              {s.family ? s.family + " line" : ""} &middot; {new Date(s.created_at).toLocaleString()}
            </span>
          </div>
          {s.payload?.person_name && <p style={styles.personName}>{s.payload.person_name}</p>}
          {s.submitted_note && <p style={styles.note}>&ldquo;{s.submitted_note}&rdquo;</p>}
          {s.submitted_name && <p style={styles.meta}>— suggested by {s.submitted_name}</p>}

          {s.kind === "upload_photo" && s.payload?.storage_path && photoUrls[s.payload.storage_path] && (
            <img src={photoUrls[s.payload.storage_path]} alt="" style={styles.photoPreview} />
          )}

          {s.kind === "edit_person" && s.target_person_id && (
            <div style={styles.editGrid}>
              <label style={styles.smallLabel}>Name</label>
              <input
                style={styles.input}
                value={draftFor(s).name}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.id]: { ...draftFor(s), name: e.target.value } }))
                }
              />
              <label style={styles.smallLabel}>Title</label>
              <input
                style={styles.input}
                value={draftFor(s).title}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.id]: { ...draftFor(s), title: e.target.value } }))
                }
              />
              <label style={styles.smallLabel}>Traits / notes</label>
              <textarea
                style={{ ...styles.input, minHeight: 60 }}
                value={draftFor(s).traits}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.id]: { ...draftFor(s), traits: e.target.value } }))
                }
              />
              <p style={styles.hint}>
                Edit the fields above to match what should actually be saved, then approve.
              </p>
            </div>
          )}

          {["add_person", "add_union", "add_child", "other"].includes(s.kind) && (
            <p style={styles.hint}>
              This is a structural change (a new person or couple) — approving records that it should
              happen, but you'll still add the row in Supabase's Table Editor (or ask Claude to add it
              the same way past tree updates were made).
            </p>
          )}

          <div style={styles.actions}>
            <button
              style={styles.approveBtn}
              disabled={busyId === s.id}
              onClick={() => resolve(s, "approve")}
            >
              {busyId === s.id ? "Working…" : "Approve"}
            </button>
            <button style={styles.rejectBtn} disabled={busyId === s.id} onClick={() => resolve(s, "reject")}>
              Reject
            </button>
          </div>
        </div>
      ))}

      <h2 style={styles.h2}>History</h2>
      {resolved.length === 0 && <p style={styles.empty}>Nothing resolved yet.</p>}
      {resolved.map((s) => (
        <div key={s.id} style={{ ...styles.card, opacity: 0.7 }}>
          <div style={styles.cardTop}>
            <span style={styles.badge}>{KIND_LABEL[s.kind] || s.kind}</span>
            <span style={{ ...styles.meta, color: s.status === "approved" ? "#3F6E52" : "#A23B2E" }}>
              {s.status}
            </span>
          </div>
          {s.payload?.person_name && <p style={styles.personName}>{s.payload.person_name}</p>}
          {s.submitted_note && <p style={styles.note}>&ldquo;{s.submitted_note}&rdquo;</p>}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "30px 20px 60px",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    color: "#2C231F",
    background: "#FAF4EA",
    minHeight: "100vh",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  h1: { fontFamily: "Fraunces, Georgia, serif", color: "#5A1620", margin: 0, fontSize: 26 },
  h2: { fontFamily: "Fraunces, Georgia, serif", color: "#5A1620", fontSize: 18, marginTop: 30 },
  sub: { color: "#8A7A6D", fontSize: 13, margin: "4px 0 0" },
  linkBtn: {
    marginLeft: 10,
    fontSize: 12.5,
    color: "#8A7A6D",
    background: "none",
    border: "1px solid #E7DAC5",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    textDecoration: "none",
  },
  empty: { color: "#8A7A6D", fontSize: 13.5 },
  card: {
    background: "#fff",
    border: "1px solid #E7DAC5",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 12,
    boxShadow: "0 1px 2px rgba(59,14,21,.06)",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  badge: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#B4863A",
    background: "#F1E6D3",
    borderRadius: 999,
    padding: "3px 9px",
  },
  meta: { fontSize: 11.5, color: "#8A7A6D" },
  personName: { fontWeight: 700, margin: "10px 0 2px", fontSize: 14.5 },
  note: { fontSize: 13.5, fontStyle: "italic", margin: "4px 0" },
  photoPreview: { width: 120, height: 120, objectFit: "cover", borderRadius: 8, margin: "8px 0" },
  editGrid: { marginTop: 10 },
  smallLabel: { display: "block", fontSize: 11.5, color: "#8A7A6D", marginTop: 8, marginBottom: 3 },
  input: {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid #E7DAC5",
    background: "#F1E6D3",
    fontSize: 13.5,
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  hint: { fontSize: 12, color: "#8A7A6D", marginTop: 8 },
  actions: { display: "flex", gap: 8, marginTop: 12 },
  approveBtn: {
    background: "#3F6E52",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  rejectBtn: {
    background: "#fff",
    color: "#A23B2E",
    border: "1px solid #A23B2E",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
