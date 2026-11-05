import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/hanken-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "CutDesk",
  description:
    "Design for cutting machines in your browser. Draw shapes, turn text and artwork into cut paths, tag cut, score and draw layers, and export clean SVG.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e3e8e4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
