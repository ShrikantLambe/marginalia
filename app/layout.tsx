import type { Metadata } from "next";
import { Crimson_Pro, JetBrains_Mono } from "next/font/google";
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackServerApp } from "@/stack";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const serif = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Marginalia — a quiet reading list",
  description:
    "Paste a link, get a TL;DR. A small reading list for thoughtful readers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body>
        <Suspense>
          <StackProvider app={stackServerApp}>
            <StackTheme>{children}</StackTheme>
          </StackProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  );
}
