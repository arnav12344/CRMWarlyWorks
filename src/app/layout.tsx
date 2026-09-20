import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WarlyWorks — Outreach CRM",
  description:
    "All-in-one cold-outreach CRM for personalized outreach: import, verify, sequence, send, and track.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
