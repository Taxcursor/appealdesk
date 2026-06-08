import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#1A1A2E] mb-2">Set Your Password</h1>
        <p className="text-sm text-[#6B7280] mb-6">
          Please set a new password for your account before continuing.
        </p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
