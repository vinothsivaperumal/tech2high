import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { SettingsProvider } from "../lib/settings";

import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "Tech2High Portal",
  description: "Role-based training portal for students, trainers, and admins"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${plexMono.variable}`}>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
