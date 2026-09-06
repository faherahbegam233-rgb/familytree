"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.h1}>Admin sign in</h1>
        <p style={styles.sub}>Only Faherah's account can sign in here.</p>
        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.btn} type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <a href="/" style={styles.back}>
          &larr; Back to the family tree
        </a>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#FAF4EA",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  card: {
    background: "#fff",
    border: "1px solid #E7DAC5",
    borderRadius: 16,
    padding: "32px 30px",
    width: 340,
    boxShadow: "0 8px 22px rgba(59,14,21,.08)",
  },
  h1: { fontFamily: "Fraunces, Georgia, serif", color: "#5A1620", margin: "0 0 4px", fontSize: 24 },
  sub: { color: "#8A7A6D", fontSize: 13, margin: "0 0 20px" },
  label: { display: "block", fontSize: 12, color: "#8A7A6D", marginBottom: 4, marginTop: 12 },
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 9,
    border: "1px solid #E7DAC5",
    background: "#F1E6D3",
    fontSize: 14,
    boxSizing: "border-box",
  },
  error: { color: "#A23B2E", fontSize: 13, marginTop: 10 },
  btn: {
    width: "100%",
    marginTop: 20,
    padding: "11px",
    borderRadius: 8,
    border: "none",
    background: "#5A1620",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  back: { display: "block", marginTop: 16, fontSize: 12.5, color: "#8A7A6D", textAlign: "center" },
};
