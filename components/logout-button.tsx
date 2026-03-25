"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { SignOut } from "@phosphor-icons/react";
import { clearAuthStorage } from "@/lib/auth-storage";

export function LogoutButton() {
  const { signOut } = useAuthActions();

  const handleLogout = async () => {
    clearAuthStorage();
    try {
      await signOut();
    } catch {
      // Storage already cleared; provider will redirect to login
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
      title="Logg ut"
      aria-label="Logg ut"
    >
      <SignOut size={20} />
    </button>
  );
}
