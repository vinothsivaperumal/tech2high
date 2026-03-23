"use client";

import {
  useSettings,
  THEMES,
  FONT_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  SIDEBAR_WIDTH_OPTIONS,
} from "../../lib/settings";

export function SettingsPanel() {
  const { settings, update, reset } = useSettings();

  return (
    <div className="stack">
      <div className="dt-header">
        <h3>Settings</h3>
        <div className="dt-header-actions">
          <button className="button secondary" onClick={reset}>
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* ── Theme Selection ─────────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">🎨 Theme</h4>
        <p className="muted" style={{ marginBottom: 14 }}>Choose a color theme for the portal</p>
        <div className="theme-grid">
          {THEMES.map(t => (
            <button
              key={t.key}
              type="button"
              className={`theme-card ${settings.theme === t.key ? "theme-card-active" : ""}`}
              onClick={() => update({ theme: t.key })}
            >
              <div className="theme-swatch" style={{ background: t.preview }} />
              <span className="theme-label">{t.label}</span>
              {settings.theme === t.key && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* ── Font Selection ──────────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">🔤 Font Family</h4>
        <p className="muted" style={{ marginBottom: 14 }}>Select a font for the interface</p>
        <div className="settings-option-grid">
          {FONT_OPTIONS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`settings-option-card ${settings.font === f.key ? "settings-option-active" : ""}`}
              onClick={() => update({ font: f.key })}
              style={{ fontFamily: f.family }}
            >
              <span className="settings-option-preview" style={{ fontFamily: f.family }}>Aa Bb Cc 123</span>
              <span className="settings-option-label">{f.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Font Size ───────────────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">🔠 Font Size</h4>
        <p className="muted" style={{ marginBottom: 14 }}>Adjust the base font size</p>
        <div className="settings-option-row">
          {FONT_SIZE_OPTIONS.map(fs => (
            <button
              key={fs.key}
              type="button"
              className={`settings-pill ${settings.fontSize === fs.key ? "settings-pill-active" : ""}`}
              onClick={() => update({ fontSize: fs.key })}
            >
              {fs.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Density / Resolution ────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">📐 Screen Density</h4>
        <p className="muted" style={{ marginBottom: 14 }}>Controls spacing and padding across the UI</p>
        <div className="settings-option-row">
          {DENSITY_OPTIONS.map(d => (
            <button
              key={d.key}
              type="button"
              className={`settings-pill ${settings.density === d.key ? "settings-pill-active" : ""}`}
              onClick={() => update({ density: d.key })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Sidebar Width ───────────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">📏 Sidebar Width</h4>
        <p className="muted" style={{ marginBottom: 14 }}>Adjust the navigation sidebar width</p>
        <div className="settings-option-row">
          {SIDEBAR_WIDTH_OPTIONS.map(w => (
            <button
              key={w.key}
              type="button"
              className={`settings-pill ${settings.sidebarWidth === w.key ? "settings-pill-active" : ""}`}
              onClick={() => update({ sidebarWidth: w.key })}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Live Preview ────────────────────────────── */}
      <section className="card settings-section">
        <h4 className="settings-section-title">👁 Live Preview</h4>
        <div className="settings-preview-box">
          <p style={{ fontSize: "1.2em", fontWeight: 600 }}>Current Settings</p>
          <div className="settings-preview-grid">
            <div className="settings-preview-item">
              <span className="muted">Theme</span>
              <span>{THEMES.find(t => t.key === settings.theme)?.label}</span>
            </div>
            <div className="settings-preview-item">
              <span className="muted">Font</span>
              <span>{FONT_OPTIONS.find(f => f.key === settings.font)?.label}</span>
            </div>
            <div className="settings-preview-item">
              <span className="muted">Font Size</span>
              <span>{FONT_SIZE_OPTIONS.find(f => f.key === settings.fontSize)?.label}</span>
            </div>
            <div className="settings-preview-item">
              <span className="muted">Density</span>
              <span>{DENSITY_OPTIONS.find(d => d.key === settings.density)?.label}</span>
            </div>
            <div className="settings-preview-item">
              <span className="muted">Sidebar</span>
              <span>{SIDEBAR_WIDTH_OPTIONS.find(w => w.key === settings.sidebarWidth)?.label}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
