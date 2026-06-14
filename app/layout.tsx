import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrum Poker",
  description: "A real-time planning poker room for agile teams."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
