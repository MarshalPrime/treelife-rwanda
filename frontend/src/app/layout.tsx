import type { Metadata } from "next";
import { Suspense } from "react";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreeLife Rwanda",
  description: "Follow urban and fruit trees in Rwanda from the nursery through planting, care, harvest, and sale.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AuthProvider>
            <Suspense fallback={<p className="loading">Loading…</p>}>{children}</Suspense>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
