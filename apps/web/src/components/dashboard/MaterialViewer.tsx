"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface ViewMaterial {
  id: string;
  title: string;
  material_type: string;
  description: string | null;
  url: string | null;
  view_only: boolean;
  display_order: number;
  course_id: string | null;
  course_title: string | null;
  batch_id: string | null;
  batch_name: string | null;
  topic_id: string | null;
  topic_title: string | null;
}

const TYPE_ICONS: Record<string, string> = { pdf: "📄", doc: "📝", link: "🔗", sql: "💾", zip: "📦", other: "📎" };

export function MaterialViewer({ apiBase }: { apiBase: string }) {
  const [materials, setMaterials] = useState<ViewMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewingTitle, setViewingTitle] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ materials: ViewMaterial[] }>(`${apiBase}/materials`);
      setMaterials(res.materials);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function viewMaterial(m: ViewMaterial) {
    if (m.url) { window.open(m.url, "_blank", "noopener"); return; }
    try {
      const res = await apiRequest<{ url: string; title: string; materialType: string }>(`${apiBase}/materials/${m.id}/view`);
      if (m.material_type === "pdf") {
        setViewingUrl(res.url);
        setViewingTitle(res.title);
      } else {
        window.open(res.url, "_blank", "noopener");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to open"); }
  }

  // Group materials by course
  const grouped = new Map<string, ViewMaterial[]>();
  const filtered = typeFilter === "all" ? materials : materials.filter((m) => m.material_type === typeFilter);
  for (const m of filtered) {
    const key = m.course_title ?? "General";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const types = [...new Set(materials.map((m) => m.material_type))];

  if (loading) return <p className="muted">Loading materials…</p>;

  // PDF Viewer overlay
  if (viewingUrl) {
    return (
      <div className="pdf-viewer-overlay">
        <div className="pdf-viewer-header">
          <h3>{viewingTitle}</h3>
          <button className="button danger" onClick={() => { setViewingUrl(null); setViewingTitle(""); }}>Close</button>
        </div>
        <iframe src={`${viewingUrl}#toolbar=0&navpanes=0`} className="pdf-viewer-frame" title={viewingTitle} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}

      <section className="card">
        <header className="card-header">
          <h3>Course Materials</h3>
          <p className="muted">{filtered.length} material(s)</p>
        </header>
        {types.length > 1 && (
          <div className="row-inline" style={{ gap: 8, marginBottom: 12 }}>
            <button className={`cred-filter-btn ${typeFilter === "all" ? "active" : ""}`} onClick={() => setTypeFilter("all")}>All</button>
            {types.map((t) => (
              <button key={t} className={`cred-filter-btn ${typeFilter === t ? "active" : ""}`} onClick={() => setTypeFilter(t)}>
                {TYPE_ICONS[t]} {t}
              </button>
            ))}
          </div>
        )}
      </section>

      {[...grouped.entries()].map(([courseName, items]) => (
        <section key={courseName} className="card">
          <header className="card-header">
            <h4>📚 {courseName}</h4>
          </header>
          <div className="mat-cards-grid">
            {items.map((m) => (
              <div key={m.id} className="mat-card" data-type={m.material_type}>
                <div className="mat-card-icon">{TYPE_ICONS[m.material_type] ?? "📎"}</div>
                <div className="mat-card-body">
                  <h5>{m.title}</h5>
                  {m.description && <p className="muted" style={{ fontSize: "0.8rem" }}>{m.description}</p>}
                  {m.topic_title && <span className="badge badge-pending" style={{ fontSize: "0.7rem" }}>{m.topic_title}</span>}
                </div>
                <div className="mat-card-actions">
                  {(m.url || m.material_type) && (
                    <button className="button-sm" onClick={() => void viewMaterial(m)}>
                      {m.material_type === "link" ? "🔗 Open" : "📄 View"}
                    </button>
                  )}
                  {m.view_only && <span className="muted" style={{ fontSize: "0.7rem" }}>🔒 View only</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!filtered.length && <p className="muted">No materials available for your batches.</p>}
    </div>
  );
}
