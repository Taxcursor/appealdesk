import Link from "next/link";
import SpUserForm from "@/components/sp/SpUserForm";
import { getCurrentUser } from "@/lib/user";
import { redirect } from "next/navigation";

export default async function NewSpUserPage() {
  const user = await getCurrentUser();
  if (!user || !["sp_admin", "director"].includes(user.role)) redirect("/users");

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/users" className="text-sm text-secondary hover:text-heading flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </Link>
        <h1 className="text-2xl font-semibold text-heading">Add SP User</h1>
        <p className="text-secondary text-sm mt-0.5">Create a new admin or staff member for your team</p>
      </div>
      <SpUserForm />
    </div>
  );
}
