import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { FeedbackProvider } from "@/components/ui/feedback";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Fraunces (display) and Public Sans (text), both SIL Open Font License 1.1,
// served from this site so pages do not wait on a third-party font host.
//
// Fraunces is the variable file, not a single weight: the display utilities set
// 900, and the font's optical-size axis turns that up into the tight,
// high-contrast cut the owner asked for — the same weight is stroke-heavy and
// narrow at 6rem, and stays readable down at section-heading sizes. Its licence
// ships beside it (`fonts/Fraunces-OFL.txt`); see docs/FONTS.md.
const display = localFont({
  src: [{ path: "./fonts/Fraunces-Variable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const sans = localFont({
  src: [
    { path: "./fonts/PublicSans-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/PublicSans-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-public-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "CONNECT-DAET | Tours",
    template: "%s | CONNECT-DAET Tours",
  },
  description: "Accredited local tour operators and experiences in Daet, Camarines Norte.",
  applicationName: "CONNECT-DAET",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved Light/Dark choice before the first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Marks the document as scripted before the first paint, so the
            one-time section reveal can hide a section without ever hiding it
            from a visitor whose browser runs no JavaScript. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
