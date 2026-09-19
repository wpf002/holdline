import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { HoldlineMark } from "./mark";
import { SiteNav } from "./site-nav";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Holdline",
  description:
    "Turns what you want from next month's schedule into a PBS bid you can enter line by line.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
    >
      <body>
        <header className="band">
          <div className="band-inner">
            <Link href="/" className="wordmark">
              <HoldlineMark />
              Holdline
            </Link>
            <SiteNav apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
