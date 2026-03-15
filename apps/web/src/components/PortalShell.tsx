"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import { clearSession, getSessionUser, SessionUser } from "../lib/auth";

interface PortalShellProps {
  role: SessionUser["role"];
  title: string;
  children: ReactNode;
}

export function PortalShell({ role, title, children }: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const sessionUser = getSessionUser();

    if (!sessionUser) {
      router.replace("/login");
      return;
    }

    if (sessionUser.role !== role) {
      router.replace(`/${sessionUser.role}`);
      return;
    }

    setUser(sessionUser);
  }, [role, router]);

  const links = useMemo(() => {
    return [
      { href: "/student", label: "Student", visible: role === "student" },
      { href: "/trainer", label: "Trainer", visible: role === "trainer" },
      { href: "/admin", label: "Admin", visible: role === "admin" }
    ].filter((link) => link.visible);
  }, [role]);

  if (!user) {
    return (
      <div className="page-wrap">
        <div className="panel">Validating session...</div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="aura aura-one" />
      <div className="aura aura-two" />
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Tech2High Portal</p>
            <h1>{title}</h1>
            <p className="muted">Signed in as {user.fullName ? `${user.fullName} (${user.email})` : user.email}</p>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
          >
            Logout
          </button>
        </header>

        <nav className="tabs">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={pathname === link.href ? "tab active" : "tab"}>
              {link.label}
            </Link>
          ))}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
