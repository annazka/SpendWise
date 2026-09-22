import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendWise — Make your budget last",
  description: "Scan receipts, track spending, and verify expense summaries on BOT Chain.",
  icons: {
    icon: "/spendwise-logo.png",
    shortcut: "/spendwise-logo.png",
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
