"use client";

interface DashboardMenuItem<T extends string> {
  key: T;
  label: string;
  hint?: string;
}

interface DashboardMenuProps<T extends string> {
  title: string;
  items: DashboardMenuItem<T>[];
  active: T;
  onChange: (next: T) => void;
}

export function DashboardMenu<T extends string>({ title, items, active, onChange }: DashboardMenuProps<T>) {
  return (
    <aside className="menu-panel">
      <p className="eyebrow">Inside Menu</p>
      <h3 style={{ marginTop: 6 }}>{title}</h3>
      <div className="menu-list" style={{ marginTop: 12 }}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === active ? "menu-button active" : "menu-button"}
            onClick={() => onChange(item.key)}
          >
            <span>{item.label}</span>
            {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}
