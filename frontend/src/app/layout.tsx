import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "TreeLife Rwanda",
  description: "Register planting sites, individual trees, and planting batches.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Suspense fallback={<p className="loading">Loading…</p>}>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
