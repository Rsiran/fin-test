"use client";

import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { useAuthActions } from "@convex-dev/auth/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { shouldAutoSignOut, markSessionActive, clearAuthStorage } from "@/lib/auth-storage";
import { NameRegistrationModal } from "@/components/name-registration-modal";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function SessionSentinel({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    if (shouldAutoSignOut()) {
      setSigningOut(true);
      clearAuthStorage();
      signOutRef.current().catch(() => {
        // Session may already be invalidated server-side (e.g. after bulk session clear)
        setSigningOut(false);
      });
    } else {
      markSessionActive();
    }
  }, [isAuthenticated, isLoading]);

  if (signingOut || isLoading) return null;
  return (
    <>
      <NameRegistrationModal />
      {children}
    </>
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <SessionSentinel>{children}</SessionSentinel>
    </ConvexAuthNextjsProvider>
  );
}
