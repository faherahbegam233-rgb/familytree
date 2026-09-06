import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import SuggestionsDashboard from "@/components/SuggestionsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const supabase = await createClient();
  const { data: suggestions } = await supabase
    .from("suggestions")
    .select("*")
    .order("created_at", { ascending: false });

  const photoPaths = (suggestions || [])
    .filter((s) => s.kind === "upload_photo" && s.payload?.storage_path)
    .map((s) => s.payload.storage_path as string);

  const photoUrls: Record<string, string> = {};
  photoPaths.forEach((p) => {
    photoUrls[p] = supabase.storage.from("photos").getPublicUrl(p).data.publicUrl;
  });

  const personIds = Array.from(
    new Set((suggestions || []).map((s) => s.target_person_id).filter(Boolean))
  ) as string[];
  const { data: people } =
    personIds.length > 0
      ? await supabase.from("people").select("*").in("id", personIds)
      : { data: [] };
  const peopleById: Record<string, any> = {};
  (people || []).forEach((p) => (peopleById[p.id] = p));

  return (
    <SuggestionsDashboard
      adminEmail={auth.user.email!}
      suggestions={suggestions || []}
      photoUrls={photoUrls}
      peopleById={peopleById}
    />
  );
}
