import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./convex-client-provider";
import { FeedbackWidget } from "@/components/feedback-widget";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinansAnalyse",
  description: "Analyser norske selskaper gjennom finansrapporter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="no" className={`${geist.variable} ${jetbrainsMono.variable}`}>
        <body className="bg-base text-[#F5F5F5] font-sans antialiased">
          <ConvexClientProvider>
            {children}
            <FeedbackWidget />
          </ConvexClientProvider>
          <div className="fixed inset-0 z-10 pointer-events-none noise-overlay" />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
