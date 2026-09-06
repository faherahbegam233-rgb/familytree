import { readFileSync } from "fs";
import path from "path";
import SupabaseBridge from "@/components/SupabaseBridge";

function readData(file: string) {
  return readFileSync(path.join(process.cwd(), "data", file), "utf8");
}

export default function TreeApp({ treeData }: { treeData: unknown }) {
  const css = readData("tree.css");
  const bodyHtml = readData("tree.body.html");
  const treeScript = readData("tree.script.js");
  const suggestScript = readData("suggest.client.js");

  return (
    <>
      <SupabaseBridge />
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* Injected before the legacy script runs, so `window.__TREE_DATA__` is
          already populated the moment it looks for it. */}
      <script
        dangerouslySetInnerHTML={{
          // Escaping "<" defends against a stray "</script>" inside any
          // free-text field (traits, notes) breaking out of this tag.
          __html: `window.__TREE_DATA__ = ${JSON.stringify(treeData).replace(/</g, "\\u003c")};`,
        }}
      />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <script dangerouslySetInnerHTML={{ __html: treeScript }} />
      <script dangerouslySetInnerHTML={{ __html: suggestScript }} />
    </>
  );
}
