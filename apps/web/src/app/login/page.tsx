import Image from "next/image";
import Link from "next/link";

type RoleOption = "student" | "trainer" | "admin";

const ROLE_CONFIG: Record<RoleOption, { icon: string; label: string; color: string; desc: string }> = {
  student: { icon: "🎓", label: "Student", color: "#4be2c2", desc: "Access courses, assignments & learning resources" },
  trainer: { icon: "🏫", label: "Trainer", color: "#ffb347", desc: "Manage batches, videos & student progress" },
  admin:   { icon: "🛡", label: "Admin",   color: "#6dacff", desc: "Full portal control, IP approvals & audit logs" },
};

export default function LoginPage() {
  return (
    <div className="page-wrap">
      <div className="aura aura-one" />
      <div className="aura aura-two" />
      <div className="login-hero">
        <div className="login-brand">
          <Image src="/logo.svg" alt="Tech2High" width={200} height={48} priority className="logo-img" />
        </div>
        <p className="muted" style={{ textAlign: "center", maxWidth: 400 }}>
          Select your role to sign in or create a new account
        </p>

        <div className="role-cards">
          {(["student", "trainer"] as RoleOption[]).map((r) => {
            const cfg = ROLE_CONFIG[r];
            return (
              <Link
                key={r}
                href={`/${r}/login`}
                className="role-card"
                style={{ "--role-color": cfg.color } as React.CSSProperties}
              >
                <span className="role-card-icon">{cfg.icon}</span>
                <h2 className="role-card-title">{cfg.label}</h2>
                <p className="role-card-desc">{cfg.desc}</p>
                <span className="role-card-arrow">→</span>
              </Link>
            );
          })}
        </div>

        <footer className="app-footer">
          © 2025 Narpavi Innovation and Technologies Services LLP. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
