import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hanya untuk uji coba di laptop: izinkan HP di Wi-Fi yang sama membuka server
  // pengembangan lewat alamat IP laptop. Ganti kalau IP laptop berubah.
  allowedDevOrigins: ["192.168.1.185"],
};

export default nextConfig;
