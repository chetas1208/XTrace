import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const TAGLINE =
  "XTrace finds AI media footprints across images, videos, and audio, then turns model evidence into an explainable provenance-risk report.";

export const metadata: Metadata = {
  title: "XTrace — Multimodal AI media forensics",
  description: TAGLINE,
  applicationName: "XTrace",
  openGraph: {
    title: "XTrace — Follow the signal. Verify the source.",
    description: TAGLINE,
    siteName: "XTrace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "XTrace — Multimodal AI media forensics",
    description: "Follow the signal. Verify the source.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="xt-grid-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
