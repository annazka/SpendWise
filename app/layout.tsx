import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendWise — Make your budget last",
  description: "Scan receipts, track spending, and verify expense summaries on BOT Chain.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
