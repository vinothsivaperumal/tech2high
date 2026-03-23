"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/* ── Theme definitions ────────────────────────────────── */
export interface ThemeDef {
  key: string;
  label: string;
  preview: string; // gradient swatch CSS
}

export const THEMES: ThemeDef[] = [
  { key: "midnight",  label: "Midnight Ocean",   preview: "linear-gradient(135deg, #f5f6fa, #eef0f5, #e94560)" },
  { key: "crimson",   label: "Crimson Blaze",    preview: "linear-gradient(135deg, #fef2f4, #fce8ec, #e94560)" },
  { key: "forest",    label: "Forest Emerald",   preview: "linear-gradient(135deg, #f0f9f2, #e0f2e4, #22c55e)" },
  { key: "royal",     label: "Royal Indigo",     preview: "linear-gradient(135deg, #f3f0ff, #e8e0ff, #8b5cf6)" },
  { key: "sunset",    label: "Sunset Amber",     preview: "linear-gradient(135deg, #fef9f0, #fef0d8, #f59e0b)" },
];

export const FONT_OPTIONS = [
  { key: "sora",       label: "Sora (Default)",         family: "var(--font-sora), sans-serif" },
  { key: "inter",      label: "Inter",                  family: "'Inter', sans-serif" },
  { key: "roboto",     label: "Roboto",                 family: "'Roboto', sans-serif" },
  { key: "poppins",    label: "Poppins",                family: "'Poppins', sans-serif" },
  { key: "mono",       label: "IBM Plex Mono",          family: "var(--font-mono), monospace" },
];

export const DENSITY_OPTIONS = [
  { key: "compact",    label: "Compact",   scale: 0.88 },
  { key: "default",    label: "Default",   scale: 1.0  },
  { key: "comfortable",label: "Comfortable", scale: 1.12 },
];

export const FONT_SIZE_OPTIONS = [
  { key: "small",   label: "Small",   size: "13px" },
  { key: "medium",  label: "Medium",  size: "15px" },
  { key: "large",   label: "Large",   size: "17px" },
  { key: "xlarge",  label: "X-Large", size: "19px" },
];

export const SIDEBAR_WIDTH_OPTIONS = [
  { key: "narrow",  label: "Narrow (220px)",  width: "220px" },
  { key: "default", label: "Default (260px)", width: "260px" },
  { key: "wide",    label: "Wide (300px)",    width: "300px" },
];

/* ── Settings state shape ─────────────────────────────── */
export interface PortalSettings {
  theme: string;
  font: string;
  density: string;
  fontSize: string;
  sidebarWidth: string;
}

const DEFAULT_SETTINGS: PortalSettings = {
  theme: "midnight",
  font: "sora",
  density: "default",
  fontSize: "medium",
  sidebarWidth: "default",
};

const STORAGE_KEY = "tech2high_settings";

/* ── Context ──────────────────────────────────────────── */
interface SettingsCtx {
  settings: PortalSettings;
  update: (partial: Partial<PortalSettings>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
});

export function useSettings() {
  return useContext(Ctx);
}

/* ── Provider ─────────────────────────────────────────── */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Persist & apply whenever settings change
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applySettings(settings);
  }, [settings, loaded]);

  const update = useCallback((partial: Partial<PortalSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return <Ctx.Provider value={{ settings, update, reset }}>{children}</Ctx.Provider>;
}

/* ── Apply settings to DOM ────────────────────────────── */
function applySettings(s: PortalSettings) {
  const root = document.documentElement;

  // Theme class
  THEMES.forEach(t => root.classList.remove(`theme-${t.key}`));
  root.classList.add(`theme-${s.theme}`);

  // Font
  const fontDef = FONT_OPTIONS.find(f => f.key === s.font);
  if (fontDef) root.style.setProperty("--app-font", fontDef.family);

  // Font size
  const fsDef = FONT_SIZE_OPTIONS.find(f => f.key === s.fontSize);
  if (fsDef) root.style.setProperty("--app-font-size", fsDef.size);

  // Density scale
  const denDef = DENSITY_OPTIONS.find(d => d.key === s.density);
  if (denDef) root.style.setProperty("--density-scale", String(denDef.scale));

  // Sidebar width
  const swDef = SIDEBAR_WIDTH_OPTIONS.find(w => w.key === s.sidebarWidth);
  if (swDef) root.style.setProperty("--sidebar-width", swDef.width);

  // Load Google Fonts if needed
  if (s.font === "inter" || s.font === "roboto" || s.font === "poppins") {
    const id = `gfont-${s.font}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${
        s.font === "inter" ? "Inter" : s.font === "roboto" ? "Roboto" : "Poppins"
      }:wght@300;400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
  }
}
