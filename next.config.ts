import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack es el bundler por defecto en Next.js 16
  turbopack: {},

  // Transpila socket.io-client y sus deps ESM para el bundle del cliente
  transpilePackages: [
    "socket.io-client",
    "engine.io-client",
    "engine.io-parser",
    "@socket.io/component-emitter",
  ],
};

export default nextConfig;
