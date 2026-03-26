import nodemailer from "nodemailer";

import { env } from "../config/env";
import { UserRole } from "../types/roles";

let warnedMissingSmtpConfig = false;

function hasSmtpConfig(): boolean {
  return Boolean(env.SMTP_HOST.trim() && env.SMTP_USER.trim() && env.SMTP_PASS.trim());
}

function createTransport() {
  if (!hasSmtpConfig()) {
    if (!warnedMissingSmtpConfig) {
      console.warn("SMTP config incomplete. Set SMTP_HOST, SMTP_USER and SMTP_PASS to enable registration emails.");
      warnedMissingSmtpConfig = true;
    }

    return null;
  }

  const options = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    ...(env.SMTP_USER.trim() && env.SMTP_PASS.trim()
      ? {
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        }
      : {})
  };

  return nodemailer.createTransport(options);
}

function toRoleTitle(role: "student" | "trainer" | "admin"): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function buildWelcomeTemplate(params: { 
  fullName: string;
  email: string;
  role: "student" | "trainer" | "admin";
  loginUrl: string;
}) {
  const roleTitle = toRoleTitle(params.role);

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;font-family:Arial,sans-serif;">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5ecf5;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f4c81,#17b890);padding:24px 28px;color:#ffffff;">
              <h1 style="margin:0;font-size:24px;line-height:1.2;">Welcome to Tech2High Portal</h1>
              <p style="margin:10px 0 0 0;font-size:14px;opacity:0.95;">Your account has been created successfully.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;color:#1f2937;">
              <p style="margin:0 0 12px 0;font-size:15px;">Hi ${params.fullName},</p>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;">
                Thank you for registering on <strong>portal.tech2high.com</strong>. Your profile is now active.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 18px 0;width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px;border:1px solid #e5ecf5;background:#f9fbff;font-size:13px;color:#4b5563;width:160px;">Registered Email</td>
                  <td style="padding:10px;border:1px solid #e5ecf5;font-size:13px;color:#111827;">${params.email}</td>
                </tr>
                <tr>
                  <td style="padding:10px;border:1px solid #e5ecf5;background:#f9fbff;font-size:13px;color:#4b5563;">Role</td>
                  <td style="padding:10px;border:1px solid #e5ecf5;font-size:13px;color:#111827;">${roleTitle}</td>
                </tr>
              </table>
              <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;">
                Use the button below to sign in and continue:
              </p>
              <p style="margin:0 0 22px 0;">
                <a href="${params.loginUrl}" style="display:inline-block;background:#0f4c81;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">
                  Login to Portal
                </a>
              </p>
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
                If you did not create this account, please contact Tech2High support immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;

  const text = [
    `Welcome to Tech2High Portal, ${params.fullName}!`,
    "",
    `Your account has been created with role: ${roleTitle}`,
    `Registered email: ${params.email}`,
    "",
    `Login URL: ${params.loginUrl}`,
    "",
    "If you did not create this account, please contact Tech2High support."
  ].join("\n");

  return { html, text };
}

export async function sendRegistrationEmail(params: {
  to: string; 
  fullName: string | null; 
  role: UserRole; 
}): Promise<{ sent: boolean }> {
  const transporter = createTransport();
  if (!transporter) {
    return { sent: false };
  }

  const fullName = params.fullName?.trim() || "Learner";
  const loginUrl = `${env.CORS_ORIGIN.replace(/\/$/, "")}/login`;
  const template = buildWelcomeTemplate({
    fullName,
    email: params.to,
    role: params.role,
    loginUrl
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: "Welcome to Tech2High Portal",
    html: template.html,
    text: template.text
  });

  return { sent: true };
}

export async function sendNotificationEmail(params: {
  to: string; 
  subject: string; 
  message: string; 
  fromName?: string; 
}): Promise<{ sent: boolean }> {
  const transporter = createTransport();
  if (!transporter) return { sent: false };

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;font-family:Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5ecf5;">
        <tr><td style="background:linear-gradient(135deg,#0f4c81,#17b890);padding:24px 28px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">Tech2High Notification</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;color:#1f2937;">
          ${params.fromName ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">From: ${params.fromName}</p>` : ""}
          <h2 style="margin:0 0 12px;font-size:18px;">${params.subject}</h2>
          <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${params.message}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  const text = `${params.fromName ? `From: ${params.fromName}\n` : ""}${params.subject}\n\n${params.message}`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: `[Tech2High] ${params.subject}`,
    html,
    text
  });

  return { sent: true };
}