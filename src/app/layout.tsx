import type { Metadata } from "next";
import { Rubik, Secular_One } from "next/font/google";
import { DEMO_METADATA } from "@/lib/demo-branding";
import { SiteTextProvider } from "@/components/providers/SiteTextProvider";
import { DataStoreProvider } from "@/components/providers/DataStoreProvider";
import { HourglassWidgetShell } from "@/components/hours/HourglassWidgetShell";
import { ProblemReportFabShell } from "@/components/ProblemReportFabShell";
import { FreeAccessSessionGuardShell } from "@/components/auth/FreeAccessSessionGuardShell";
import { DemoBanner } from "@/components/DemoBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const secularOne = Secular_One({
  variable: "--font-secular",
  subsets: ["hebrew", "latin"],
  weight: "400",
});

export function generateMetadata(): Metadata {
  return {
    title: DEMO_METADATA.title,
    description: DEMO_METADATA.description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} ${secularOne.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden bg-background text-foreground font-sans">
        <SiteTextProvider>
          <DataStoreProvider>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="print:hidden">
                <DemoBanner />
              </div>
              {/* אזור גלילה יחיד לכל הדפים */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {children}
              </div>
              <div className="print:hidden">
                <SiteFooter />
              </div>
            </div>
            {/* לא נכללים בהדפסה (תיקים / טפסים / Ctrl+P) */}
            <div data-matoah-chrome className="print:hidden">
              <HourglassWidgetShell />
              <ProblemReportFabShell />
            </div>
            <div className="print:hidden">
              <FreeAccessSessionGuardShell />
            </div>
          </DataStoreProvider>
        </SiteTextProvider>
      </body>
    </html>
  );
}
