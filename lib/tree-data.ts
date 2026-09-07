import { createClient } from "@/lib/supabase-server";
import seed from "@/supabase/tree-data.json";

export type Family = "abubakar" | "kuddus" | "maricar";

type PersonRow = {
  id: string;
  family: Family;
  name: string;
  gender: string;
  gen: number;
  title: string | null;
  traits: string | null;
  unknown: boolean;
  is_user: boolean;
  photo_url: string | null;
  dob: string | null;
  status: string | null;
  occupation: string | null;
};
type UnionRow = { id: string; family: Family; partner1_id: string; partner2_id: string | null; note: string | null };
type ChildRow = { union_id: string; child_id: string; position: number };

function personToClientShape(p: PersonRow) {
  const extra: Record<string, unknown> = {};
  if (p.title) extra.title = p.title;
  if (p.traits) extra.traits = p.traits;
  if (p.unknown) extra.unknown = true;
  if (p.is_user) extra.isUser = true;
  if (p.dob) extra.dob = p.dob;
  if (p.status && p.status !== "unknown") extra.status = p.status;
  if (p.occupation) extra.occupation = p.occupation;
  return { name: p.name, gender: p.gender, gen: p.gen, ...extra };
}

/**
 * Shapes rows back into the exact {A, Aunions, K, Kunions, M, Munions}
 * structure the original tree.script.js expects, so the verified renderer
 * doesn't need to change at all. Falls back to the bundled seed JSON
 * (the same data that's pixel-verified against the source PDF) if Supabase
 * isn't reachable yet or hasn't been seeded.
 */
export async function getTreeData() {
  try {
    const supabase = await createClient();
    const [{ data: people, error: e1 }, { data: unions, error: e2 }, { data: children, error: e3 }] =
      await Promise.all([
        supabase.from("people").select("*"),
        supabase.from("unions").select("*"),
        supabase.from("union_children").select("*").order("position"),
      ]);
    if (e1 || e2 || e3 || !people || !unions || !children || people.length === 0) {
      throw e1 || e2 || e3 || new Error("Supabase returned no people — falling back to seed data.");
    }

    const byFamily: Record<Family, { people: Record<string, unknown>; unions: unknown[] }> = {
      abubakar: { people: {}, unions: [] },
      kuddus: { people: {}, unions: [] },
      maricar: { people: {}, unions: [] },
    };
    const photoOverrides: Record<string, string> = {};

    (people as PersonRow[]).forEach((p) => {
      byFamily[p.family].people[p.id] = personToClientShape(p);
      if (p.photo_url) photoOverrides[p.id] = p.photo_url;
    });

    const childrenByUnion = new Map<string, string[]>();
    (children as ChildRow[]).forEach((c) => {
      const arr = childrenByUnion.get(c.union_id) || [];
      arr.push(c.child_id);
      childrenByUnion.set(c.union_id, arr);
    });

    (unions as UnionRow[]).forEach((u) => {
      const entry: { p: (string | null)[]; c: string[]; note?: string } = {
        p: [u.partner1_id, u.partner2_id],
        c: childrenByUnion.get(u.id) || [],
      };
      if (u.note) entry.note = u.note;
      byFamily[u.family].unions.push(entry);
    });

    return {
      A: byFamily.abubakar.people,
      Aunions: byFamily.abubakar.unions,
      K: byFamily.kuddus.people,
      Kunions: byFamily.kuddus.unions,
      M: byFamily.maricar.people,
      Munions: byFamily.maricar.unions,
      photoOverrides,
    };
  } catch {
    // Supabase isn't reachable (not seeded yet, or an outage) — fall back to
    // the bundled seed JSON, which is the same data pixel-verified against
    // the source book. Pull any photo_url values that were baked into the
    // seed straight from the book (e.g. verified portraits) into
    // photoOverrides too, so they still show up even off the fallback path.
    const s = seed as any;
    const photoOverrides: Record<string, string> = {};
    (["A", "K", "M"] as const).forEach((key) => {
      Object.entries(s[key] || {}).forEach(([id, p]: [string, any]) => {
        if (p && p.photo_url) photoOverrides[id] = p.photo_url;
      });
    });
    return { ...s, photoOverrides };
  }
}
