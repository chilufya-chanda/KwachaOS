import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kwacha OS — The Autonomous Operating System for AI Agents",
  description:
    "Give AI a mission, resources, permissions and tools. Kwacha plans, delegates, executes, observes, adapts, and reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-kwacha-black text-white antialiased">{children}</body>
    </html>
  );
}
