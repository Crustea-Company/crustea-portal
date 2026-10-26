import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crustea Portal",
  description: "Portal internal PT Eco Karya Teknologi (Crustea)",
  applicationName: "Crustea Portal",
  appleWebApp: { capable: true, title: "Crustea", statusBarStyle: "default" },
  // Ikon dibuat dari logo oleh scripts/generate-icons.mjs.
  icons: {
    icon: [{ url: "/icons/tab-icon.png", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
