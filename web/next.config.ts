import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker de producción (Dockerfile.prod) copia `.next/standalone`.
  output: "standalone",
};

export default nextConfig;
