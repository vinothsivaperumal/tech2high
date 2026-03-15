import { ReactNode } from "react";

interface StatusCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function StatusCard({ title, subtitle, children }: StatusCardProps) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
