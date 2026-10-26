import type { MetadataRoute } from "next";
import { BRAND_HEX } from "@/lib/brand";

// Data agar aplikasi bisa di-install di HP (PWA): nama, ikon, warna.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crustea Portal",
    short_name: "Crustea",
    description: "Portal internal PT Eco Karya Teknologi (Crustea)",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: BRAND_HEX,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
