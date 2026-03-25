"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { SignOut } from "@phosphor-icons/react";
import { clearAuthStorage } from "@/lib/auth-storage";

export function LogoutButton() {
  const { signOut } = useAuthActions();

  const handleLogout = () => {
    clearAuthStorage();
    signOut();
  };

  return (
    <button
      onClick={handleLogout}
      className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
      title="Logg ut"
    >
      <SignOut size={20} />
    </button>
  );
}
