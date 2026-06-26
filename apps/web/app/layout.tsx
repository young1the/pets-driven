import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pets-Driven — a cute way to develop with AI agents",
  description:
    "Development is over. Give your pets a task and watch the pack take it from here — a cute way to develop with AI agents.",
  icons: { icon: "/petsdriven-mark.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
