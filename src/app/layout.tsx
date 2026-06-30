import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist is an incredibly dense, clean font—perfect for heavy data ledgers.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The metadata sets the browser tab title and search engine description.
// Updated to sound like a high-end financial/infrastructure terminal.
export const metadata: Metadata = {
  title: "KESHWAM INFRA | Sovereign Terminal",
  description: "Real-time IoT Telemetry and Egress Ledger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Injects the custom fonts and ensures smooth font rendering (antialiased)
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body 
        // 1. bg-slate-50 creates a stark, glare-free background for our financial charts.
        // 2. text-slate-900 ensures maximum contrast for text readability.
        // 3. selection:bg-teal-200 makes text highlighting match your chart colors.
        className="min-h-full flex flex-col bg-slate-50 text-slate-900 selection:bg-teal-200 selection:text-teal-900 font-sans overflow-x-hidden"
      >
        {children}
      </body>
    </html>
  );
}