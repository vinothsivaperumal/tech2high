"use client";

import Image from "next/image";
import { usePortalShell, getInitials } from "./PortalShell";

interface DashboardMenuItem<T extends string> {
  key: T;
  label: string;
  icon?: string;
  badge?: number;
}

interface DashboardMenuSection<T extends string> {
  title: string;
  items: DashboardMenuItem<T>[];
}

interface DashboardMenuProps<T extends string> {
  sections: DashboardMenuSection<T>[];
  active: T;
  onChange: (next: T) => void;
  mainContent?: React.ReactNode;
}

export function DashboardMenu<T extends string>({
  sections,
  active,
  onChange,
  mainContent
}: DashboardMenuProps<T>) {
  const { user, roleLabel, title, onLogout } = usePortalShell();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <Image src="/logo.svg" alt="Tech2High" width={160} height={38} className="logo-img" />
          </div>
        </div>

        <div className="sidebar-content">
          <nav className="sidebar-nav">
            {sections.map((section, idx) => (
              <div className="nav-section" key={idx}>
                <p className="nav-section-title">{section.title}</p>
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={item.key === active ? "nav-item active" : "nav-item"}
                    onClick={() => onChange(item.key)}
                  >
                    {item.icon ? <span className="nav-icon">{item.icon}</span> : null}
                    <span className="nav-label">{item.label}</span>
                    {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{getInitials(user.fullName)}</div>
            <div className="user-info">
              <span className="user-name">{user.fullName || user.email}</span>
              <span className="user-role">{roleLabel} · {title}</span>
            </div>
          </div>
          <button className="sidebar-logout" title="Logout" onClick={onLogout}>
            ⏻
          </button>
        </div>
      </aside>

      <div className="main-area">
        <div className="aura aura-one" />
        <div className="aura aura-two" />
        {mainContent ? <div className="main-scroll">{mainContent}</div> : null}
        <footer className="app-footer app-footer-dashboard">
          © 2025 Narpavi Innovation and Technologies Services LLP. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
