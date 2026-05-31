import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaniKani Sentence Generator",
  description: "Generate Japanese sentences constrained to WaniKani vocabulary.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
