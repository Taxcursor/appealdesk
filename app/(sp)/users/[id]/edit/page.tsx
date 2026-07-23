import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/user";
import EditSpUserForm from "@/components/sp/EditSpUserForm";
import EditClientUserForm from "@/components/sp/EditClientUserForm";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser || !["sp_admin", "director"].includes(currentUser.role)) redirect("/users");

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select(`
      id, first_name, middle_name, last_name, email, role, org_id, is_active,
      mobile_country_code, mobile_number, date_of_birth, avatar_url,
      designation, department, date_of_joining, date_of_leaving,
      address_line1, address_line2, city, pin_code, location, country,
      pan_number, pan_attachment, aadhar_number, aadhar_attachment
    `)
    .eq("id", id)
    .single();

  if (!user) notFound();

  const isClientUser = user.role === "client";
  const backTab = isClientUser ? "?tab=clients" : "";

  // Fetch client orgs for client user editor
  let clientOrgs: { id: string; name: string }[] = [];
  if (isClientUser) {
    const spId = currentUser.service_provider_id ?? currentUser.org_id;
    const { data } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("parent_sp_id", spId!)
      .eq("type", "client")
      .eq("is_active", true)
      .order("name");
    clientOrgs = data ?? [];
  }

  const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(" ");

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/users${backTab}`}
          className="text-sm text-secondary hover:text-heading flex items-center gap-1 mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </Link>
        <h1 className="text-2xl font-semibold text-heading">Edit User</h1>
        <p className="text-secondary text-sm mt-0.5">{fullName} · {user.email}</p>
      </div>

      {isClientUser ? (
        <EditClientUserForm user={user} clientOrgs={clientOrgs} />
      ) : (
        <EditSpUserForm user={user} />
      )}
    </div>
  );
}
