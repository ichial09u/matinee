import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-logo",
  weight: "400",
  subsets: ["latin"],
});

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#141414"/><path d="M14 50V14h9l9 20 9-20h9v36h-9V30l-9 19-9-19v20z" fill="#E50914"/></svg>`
  );

export const metadata: Metadata = {
  title: "Matinee — Watch Movies and TV Shows Online",
  description:
    "Watch movies and TV shows online. Trending films, episode guides, and trailers — streaming on any screen. Powered by TMDB and TVMaze.",
  keywords: ["movies", "TV shows", "watch online", "trailers"],
  authors: [{ name: "Matinee" }],
  icons: { icon: FAVICON },
  openGraph: {
    title: "Matinee — Watch Movies and TV Shows Online",
    description:
      "Trending movies and TV worth staying up for — no accounts, no trackers.",
    siteName: "Matinee",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Warm the connection to the streaming embed while the user
            browses, so hitting Play starts loading a source right away
            instead of paying the DNS + TLS handshake first. */}
        <link rel="preconnect" href="https://cinesrc.st" />
        <link rel="dns-prefetch" href="https://cinesrc.st" />
      </head>
      <body
        className={`${inter.variable} ${bebasNeue.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
