import TreeApp from "@/components/TreeApp";
import { getTreeData } from "@/lib/tree-data";

export const dynamic = "force-dynamic"; // always reflect the latest approved edits

export default async function HomePage() {
  const treeData = await getTreeData();
  return <TreeApp treeData={treeData} />;
}
