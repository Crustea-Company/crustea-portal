import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hanya untuk uji coba di laptop: izinkan HP di Wi-Fi yang sama membuka server
  // pengembangan lewat alamat IP laptop. Ganti kalau IP laptop berubah.
  allowedDevOrigins: ["192.168.1.185"],
  // Gambar ilustrasi prosedur dibaca dari folder panduan-gambar/ saat aplikasi berjalan (ikut di-deploy).
  outputFileTracingIncludes: {
    "/prosedur/**": ["./panduan-gambar/*.png"],
  },
  // Menu Aquaculture pindah ke Project Management (migrasi 024): link lama tetap berfungsi.
  async redirects() {
    return [{ source: "/aquaculture/:path*", destination: "/projects/:path*", permanent: true }];
  },
};

export default nextConfig;
