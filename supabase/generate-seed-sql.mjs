// Turns tree-data.json (produced by extract-data.mjs) into a seed.sql file
// of plain INSERT statements, so seeding the DB doesn't require running any
// app code or holding Supabase credentials on this machine at all — Faherah
// just pastes seed.sql into the Supabase SQL Editor once, after schema.sql.
import { readFileSync, writeFileSync } from "fs";

const { A, Aunions, K, Kunions, M, Munions } = JSON.parse(
  readFileSync(new URL("./tree-data.json", import.meta.url), "utf8")
);

function sqlStr(v) {
  if (v === undefined || v === null) return "null";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlBool(v) {
  return v ? "true" : "false";
}

let sql = `-- ============================================================================
-- Family Tree app — seed data
-- Generated from the verified family-tree-preview.html data block. Run this
-- AFTER schema.sql, once, in the Supabase SQL Editor. Safe to re-run: it
-- upserts everything by id.
-- ============================================================================

`;

function emitFamily(familyKey, people, unions) {
  sql += `-- ---------- ${familyKey} : people ----------\n`;
  sql += "insert into people (id, family, name, gender, gen, title, traits, unknown, is_user) values\n";
  const rows = Object.entries(people).map(([id, p]) => {
    return `  (${sqlStr(id)}, ${sqlStr(familyKey)}, ${sqlStr(p.name)}, ${sqlStr(p.gender)}, ${p.gen}, ${sqlStr(
      p.title
    )}, ${sqlStr(p.traits)}, ${sqlBool(!!p.unknown)}, ${sqlBool(!!p.isUser)})`;
  });
  sql += rows.join(",\n") + "\n";
  sql += `on conflict (id) do update set
  family = excluded.family, name = excluded.name, gender = excluded.gender, gen = excluded.gen,
  title = excluded.title, traits = excluded.traits, unknown = excluded.unknown, is_user = excluded.is_user,
  updated_at = now();\n\n`;

  sql += `-- ---------- ${familyKey} : unions ----------\n`;
  sql += "insert into unions (id, family, partner1_id, partner2_id, note) values\n";
  const unionRows = unions.map((u, i) => {
    const id = `${familyKey}_u${i + 1}`;
    return `  (${sqlStr(id)}, ${sqlStr(familyKey)}, ${sqlStr(u.p[0])}, ${sqlStr(u.p[1])}, ${sqlStr(u.note)})`;
  });
  sql += unionRows.join(",\n") + "\n";
  sql += `on conflict (id) do update set
  partner1_id = excluded.partner1_id, partner2_id = excluded.partner2_id, note = excluded.note,
  updated_at = now();\n\n`;

  sql += `-- ---------- ${familyKey} : union_children ----------\n`;
  sql += "delete from union_children where union_id like " + sqlStr(familyKey + "_u%") + ";\n";
  const childRows = [];
  unions.forEach((u, i) => {
    const unionId = `${familyKey}_u${i + 1}`;
    (u.c || []).forEach((childId, pos) => {
      childRows.push(`  (${sqlStr(unionId)}, ${sqlStr(childId)}, ${pos})`);
    });
  });
  if (childRows.length) {
    sql += "insert into union_children (union_id, child_id, position) values\n";
    sql += childRows.join(",\n") + ";\n\n";
  }
}

emitFamily("abubakar", A, Aunions);
emitFamily("kuddus", K, Kunions);
emitFamily("maricar", M, Munions);

writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log("Wrote supabase/seed.sql");
