"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { clearSession, getSessionUser, SessionUser } from "../lib/auth";

interface PortalShellProps {
  role: SessionUser["role"];
  title: string;
  children: ReactNode;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PortalShell({ role, title, children }: PortalShellProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const sessionUser = getSessionUser();

    if (!sessionUser) {
      router.replace(`/${role}/login`);
      return;
    }

    if (sessionUser.role !== role) {
      router.replace(`/${sessionUser.role}`);
      return;
    }

    setUser(sessionUser);
  }, [role, router]);

  if (!user) {
    return (
      <div className="page-wrap">
        <div className="panel">Validating session...</div>
      </div>
    );
  }

  const roleLabel =
    role === "student" ? "Student" : role === "trainer" ? "Trainer" : "Admin";

  return (
    <PortalShellContext.Provider
      value={{ user, roleLabel, title, onLogout: () => { clearSession(); router.replace(`/${role}/login`); } }}
    >
      {children}
    </PortalShellContext.Provider>
  );
}

/* ── Context so children can access user / logout ─── */
import { createContext, useContext } from "react";

interface ShellCtx {
  user: SessionUser;
  roleLabel: string;
  title: string;
  onLogout: () => void;
}

const PortalShellContext = createContext<ShellCtx | null>(null);

export function usePortalShell() {
  const ctx = useContext(PortalShellContext);
  if (!ctx) throw new Error("usePortalShell must be used inside PortalShell");
  return ctx;
}

export { getInitials };
