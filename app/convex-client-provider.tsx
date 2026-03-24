"use client";

import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { useAuthActions } from "@convex-dev/auth/react";
import { ReactNode, useEffect } from "react";
import { shouldAutoSignOut, markSessionActive, clearAuthStorage } from "@/lib/auth-storage";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function SessionSentinel({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    if (shouldAutoSignOut()) {
      clearAuthStorage();
      signOut();
    } else {
      markSessionActive();
    }
  }, [isAuthenticated, isLoading, signOut]);

  return <>{children}</>;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <SessionSentinel>{children}</SessionSentinel>
    </ConvexAuthNextjsProvider>
  );
}
