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
  applied_snapshot: Record<string, any> | null;
  created_at: string;
  resolved_at: string | null;
};

type PersonDraft = {
  name: string;
  gender: string;
  title: string;
  traits: string;
  dob: string;
  status: string;
  occupation: string;
};

const KIND_LABEL: Record<string, string> = {
  edit_person: "Edit existing person",
  add_person: "Add a person",
  add_union: "Add a couple",
  add_child: "Add a child",
  add_partner: "Add a partner",
  upload_photo: "Photo upload",
  other: "Other",
};

const STATUS_OPTIONS = [
  ["unknown", "Not sure"],
  ["living", "Living"],
  ["deceased", "Deceased"],
];

function emptyDraft(): PersonDraft {
  return { name: "", gender: "", title: "", traits: "", dob: "", status: "unknown", occupation: "" };
}

function describeSnapshot(s: Suggestion, peopleById: Record<string, any>): string {
  const snap = s.applied_snapshot;
  if (!snap) return "";
  if (snap.type === "edit_person") {
    const fields = Object.keys(snap.fields || {});
    return fields.length ? "Updated: " + fields.join(", ") : "Approved, no fields changed.";
  }
  if (snap.type === "upload_photo") return "Photo saved to their profile.";
  if (snap.type === "add_child") {
    const name = peopleById[snap.person_id]?.name || snap.person_id;
    return `Added "${name}" as a new person (Gen ${snap.gen}).`;
  }
  if (snap.type === "add_partner") {
    const name = peopleById[snap.person_id]?.name || snap.person_id;
    return `Added "${name}" as a new person (Gen ${snap.gen}).`;
  }
  return "";
}

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
  const [drafts, setDrafts] = useState<Record<string, PersonDraft>>({});

  const pending = useMemo(() => list.filter((s) => s.status === "pending"), [list]);
  const resolved = useMemo(() => list.filter((s) => s.status !== "pending"), [list]);

  function draftFor(s: Suggestion): PersonDraft {
    if (drafts[s.id]) return drafts[s.id];
    if (s.kind === "edit_person") {
      const proposed = s.payload?.proposed;
      const current = s.target_person_id ? peopleById[s.target_person_id] : null;
      const src = proposed || current;
      return {
        ...emptyDraft(),
        name: src?.name || "",
        title: current?.title || "",
        traits: src?.traits || "",
        dob: src?.dob || "",
        status: src?.status || "unknown",
        occupation: src?.occupation || "",
      };
    }
    if (s.kind === "add_child" || s.kind === "add_partner") {
      const np = s.payload?.new_person || {};
      return {
        ...emptyDraft(),
        name: np.name || "",
        gender: np.gender || "",
        traits: np.traits || "",
        dob: np.dob || "",
        status: np.status || "unknown",
        occupation: np.occupation || "",
      };
    }
    return emptyDraft();
  }

  function setDraft(s: Suggestion, patch: Partial<PersonDraft>) {
    setDrafts((d) => ({ ...d, [s.id]: { ...draftFor(s), ...patch } }));
  }

  async function resolve(s: Suggestion, action: "approve" | "reject") {
    setBusyId(s.id);
    const editedFields =
      action === "approve" && ["edit_person", "add_child", "add_partner"].includes(s.kind)
        ? draftFor(s)
        : undefined;
    const res = await fetch("/api/suggestions/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, action, editedFields }),
    });
    setBusyId(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error || "Something went wrong.");
      return;
    }
    setList((prev) =>
      prev.map((x) =>
        x.id === s.id
          ? { ...x, status: action === "approve" ? "approved" : "rejected", applied_snapshot: body.appliedSnapshot }
          : x
      )
    );
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function relatedNames(s: Suggestion) {
    if (s.kind === "add_child") {
      const p1 = peopleById[s.payload?.parent1_id]?.name || s.payload?.parent1_id;
      const p2 = s.payload?.parent2_id ? peopleById[s.payload.parent2_id]?.name || s.payload.parent2_id : null;
      return "Child of " + p1 + (p2 ? " & " + p2 : "");
    }
    if (s.kind === "add_partner") {
      const p = peopleById[s.payload?.existing_person_id]?.name || s.payload?.existing_person_id;
      return "Partner of " + p;
    }
    return null;
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
      {pending.map((s) => {
        const draft = draftFor(s);
        const showPersonEditor = ["edit_person", "add_child", "add_partner"].includes(s.kind);
        const isNewPerson = s.kind === "add_child" || s.kind === "add_partner";
        return (
          <div key={s.id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.badge}>{KIND_LABEL[s.kind] || s.kind}</span>
              <span style={styles.meta}>
                {s.family ? s.family + " line" : ""} &middot; {new Date(s.created_at).toLocaleString()}
              </span>
            </div>
            {relatedNames(s) && <p style={styles.meta}>{relatedNames(s)}</p>}
            {s.payload?.person_name && !isNewPerson && <p style={styles.personName}>{s.payload.person_name}</p>}
            {s.submitted_note && <p style={styles.note}>&ldquo;{s.submitted_note}&rdquo;</p>}
            {s.submitted_name && <p style={styles.meta}>— suggested by {s.submitted_name}</p>}

            {s.kind === "upload_photo" && s.payload?.storage_path && photoUrls[s.payload.storage_path] && (
              <img src={photoUrls[s.payload.storage_path]} alt="" style={styles.photoPreview} />
            )}

            {showPersonEditor && (
              <div style={styles.editGrid}>
                <label style={styles.smallLabel}>Name</label>
                <input style={styles.input} value={draft.name} onChange={(e) => setDraft(s, { name: e.target.value })} />
                {isNewPerson && (
                  <>
                    <label style={styles.smallLabel}>Gender</label>
                    <select style={styles.input} value={draft.gender} onChange={(e) => setDraft(s, { gender: e.target.value })}>
                      <option value="">Choose…</option>
                      <option value="f">Female</option>
                      <option value="m">Male</option>
                      <option value="u">Not sure</option>
                    </select>
                  </>
                )}
                <label style={styles.smallLabel}>Date of birth</label>
                <input style={styles.input} value={draft.dob} onChange={(e) => setDraft(s, { dob: e.target.value })} />
                <label style={styles.smallLabel}>Status</label>
                <select style={styles.input} value={draft.status} onChange={(e) => setDraft(s, { status: e.target.value })}>
                  {STATUS_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <label style={styles.smallLabel}>What they do / did</label>
                <input style={styles.input} value={draft.occupation} onChange={(e) => setDraft(s, { occupation: e.target.value })} />
                <label style={styles.smallLabel}>Traits / notes</label>
                <textarea
                  style={{ ...styles.input, minHeight: 60 }}
                  value={draft.traits}
                  onChange={(e) => setDraft(s, { traits: e.target.value })}
                />
                <p style={styles.hint}>Edit any field above to match what should actually be saved, then approve.</p>
              </div>
            )}

            {["add_person", "add_union", "other"].includes(s.kind) && (
              <p style={styles.hint}>
                This suggestion doesn't fit a specific form — approving records that it should happen, but
                you'll add the actual row in Supabase's Table Editor (or ask Claude), the same way past tree
                updates were made.
              </p>
            )}

            <div style={styles.actions}>
              <button
                style={{ ...styles.approveBtn, opacity: busyId === s.id ? 0.6 : 1 }}
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
        );
      })}

      <h2 style={styles.h2}>History</h2>
      {resolved.length === 0 && <p style={styles.empty}>Nothing resolved yet.</p>}
      {resolved.map((s) => (
        <div key={s.id} style={{ ...styles.card, opacity: 0.75 }}>
          <div style={styles.cardTop}>
            <span style={styles.badge}>{KIND_LABEL[s.kind] || s.kind}</span>
            <span style={{ ...styles.meta, color: s.status === "approved" ? "#3F6E52" : "#A23B2E" }}>
              {s.status} &middot; {s.resolved_at ? new Date(s.resolved_at).toLocaleString() : ""}
            </span>
          </div>
          {relatedNames(s) && <p style={styles.meta}>{relatedNames(s)}</p>}
          {s.payload?.person_name && <p style={styles.personName}>{s.payload.person_name}</p>}
          {s.payload?.new_person?.name && <p style={styles.personName}>{s.payload.new_person.name}</p>}
          {s.submitted_note && <p style={styles.note}>&ldquo;{s.submitted_note}&rdquo;</p>}
          {s.submitted_name && <p style={styles.meta}>— suggested by {s.submitted_name}</p>}
          {s.status === "approved" && describeSnapshot(s, peopleById) && (
            <p style={{ ...styles.meta, color: "#3F6E52", marginTop: 6 }}>{describeSnapshot(s, peopleById)}</p>
          )}
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
