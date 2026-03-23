"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";

interface CompanySettings {
  company_name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  zip_code: string;
  phone: string;
  email: string;
  website: string;
  gst_number: string;
  pan_number: string;
  support_email: string;
  social_linkedin: string;
  social_twitter: string;
  social_youtube: string;
  social_instagram: string;
  social_facebook: string;
  footer_text: string;
  terms_url: string;
  privacy_url: string;
  updated_at: string;
}

const EMPTY: CompanySettings = {
  company_name: "", tagline: "", logo_url: "", favicon_url: "",
  address_line1: "", address_line2: "", city: "", state: "", country: "", zip_code: "",
  phone: "", email: "", website: "", gst_number: "", pan_number: "", support_email: "",
  social_linkedin: "", social_twitter: "", social_youtube: "", social_instagram: "", social_facebook: "",
  footer_text: "", terms_url: "", privacy_url: "", updated_at: "",
};

export function CompanySettingsPanel() {
  const [settings, setSettings] = useState<CompanySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ settings: CompanySettings | null }>("/admin/company-settings");
      setSettings(res.settings ?? EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function set(field: keyof CompanySettings, value: string) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiRequest<{ settings: CompanySettings }>("/admin/company-settings", "PUT", {
        companyName: settings.company_name,
        tagline: settings.tagline,
        logoUrl: settings.logo_url,
        faviconUrl: settings.favicon_url,
        addressLine1: settings.address_line1,
        addressLine2: settings.address_line2,
        city: settings.city,
        state: settings.state,
        country: settings.country,
        zipCode: settings.zip_code,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
        gstNumber: settings.gst_number,
        panNumber: settings.pan_number,
        supportEmail: settings.support_email,
        socialLinkedin: settings.social_linkedin,
        socialTwitter: settings.social_twitter,
        socialYoutube: settings.social_youtube,
        socialInstagram: settings.social_instagram,
        socialFacebook: settings.social_facebook,
        footerText: settings.footer_text,
        termsUrl: settings.terms_url,
        privacyUrl: settings.privacy_url,
      });
      setSettings(res.settings);
      setMessage("Company settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading company settings...</p>;

  return (
    <div className="stack">
      {error && <p className="message error">{error}</p>}
      {message && <p className="message success">{message}</p>}

      {/* Company Identity */}
      <section className="card">
        <header className="card-header">
          <h3>🏢 Company Identity</h3>
          <p className="muted">Basic company information visible across the portal</p>
        </header>

        <div className="form-grid">
          <label>
            Company Name *
            <input value={settings.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="e.g. Tech2High" />
          </label>
          <label>
            Tagline
            <input value={settings.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Empowering Careers in Tech" />
          </label>
          <label>
            Logo URL
            <input value={settings.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Favicon URL
            <input value={settings.favicon_url} onChange={(e) => set("favicon_url", e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Website
            <input value={settings.website} onChange={(e) => set("website", e.target.value)} placeholder="https://www.tech2high.com" />
          </label>
          <label>
            Footer Text
            <input value={settings.footer_text} onChange={(e) => set("footer_text", e.target.value)} placeholder="© 2026 Tech2High. All rights reserved." />
          </label>
        </div>
      </section>

      {/* Address */}
      <section className="card">
        <header className="card-header">
          <h3>📍 Address</h3>
        </header>
        <div className="form-grid">
          <label>
            Address Line 1
            <input value={settings.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Street / Building" />
          </label>
          <label>
            Address Line 2
            <input value={settings.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Suite / Floor" />
          </label>
          <label>
            City
            <input value={settings.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
          </label>
          <label>
            State
            <input value={settings.state} onChange={(e) => set("state", e.target.value)} placeholder="State / Province" />
          </label>
          <label>
            Country
            <input value={settings.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" />
          </label>
          <label>
            ZIP / Postal Code
            <input value={settings.zip_code} onChange={(e) => set("zip_code", e.target.value)} placeholder="ZIP Code" />
          </label>
        </div>
      </section>

      {/* Contact Information */}
      <section className="card">
        <header className="card-header">
          <h3>📞 Contact Information</h3>
        </header>
        <div className="form-grid">
          <label>
            Phone
            <input value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
          </label>
          <label>
            Email
            <input type="email" value={settings.email} onChange={(e) => set("email", e.target.value)} placeholder="info@tech2high.com" />
          </label>
          <label>
            Support Email
            <input type="email" value={settings.support_email} onChange={(e) => set("support_email", e.target.value)} placeholder="support@tech2high.com" />
          </label>
        </div>
      </section>

      {/* Tax / Legal */}
      <section className="card">
        <header className="card-header">
          <h3>📋 Tax &amp; Legal</h3>
        </header>
        <div className="form-grid">
          <label>
            GST Number
            <input value={settings.gst_number} onChange={(e) => set("gst_number", e.target.value)} placeholder="22XXXXX1234X1Z5" />
          </label>
          <label>
            PAN Number
            <input value={settings.pan_number} onChange={(e) => set("pan_number", e.target.value)} placeholder="ABCDE1234F" />
          </label>
          <label>
            Terms &amp; Conditions URL
            <input value={settings.terms_url} onChange={(e) => set("terms_url", e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Privacy Policy URL
            <input value={settings.privacy_url} onChange={(e) => set("privacy_url", e.target.value)} placeholder="https://..." />
          </label>
        </div>
      </section>

      {/* Social Links */}
      <section className="card">
        <header className="card-header">
          <h3>🔗 Social Links</h3>
        </header>
        <div className="form-grid">
          <label>
            LinkedIn
            <input value={settings.social_linkedin} onChange={(e) => set("social_linkedin", e.target.value)} placeholder="https://linkedin.com/company/..." />
          </label>
          <label>
            Twitter / X
            <input value={settings.social_twitter} onChange={(e) => set("social_twitter", e.target.value)} placeholder="https://twitter.com/..." />
          </label>
          <label>
            YouTube
            <input value={settings.social_youtube} onChange={(e) => set("social_youtube", e.target.value)} placeholder="https://youtube.com/@..." />
          </label>
          <label>
            Instagram
            <input value={settings.social_instagram} onChange={(e) => set("social_instagram", e.target.value)} placeholder="https://instagram.com/..." />
          </label>
          <label>
            Facebook
            <input value={settings.social_facebook} onChange={(e) => set("social_facebook", e.target.value)} placeholder="https://facebook.com/..." />
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="row-inline">
        <button type="button" className="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "💾 Save Company Settings"}
        </button>
        {settings.updated_at && (
          <span className="muted" style={{ fontSize: "0.85em" }}>
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
