import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@medicore/ui";
import { QueryProvider } from "@/components/providers/query-provider";
import { DarkModeProvider } from "@/components/providers/dark-mode-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Medicore",
  description: "Medicore — medicine & pharmaceutical distribution platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors">
        <DarkModeProvider>
          <QueryProvider>{children}</QueryProvider>
          <Toaster />
        </DarkModeProvider>
      </body>
    </html>
  );
}
