import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operating System",
  description: "A company that runs as a weekly loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
