import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (default en Next.js 16) maneja los módulos ESM de socket.io
  // automáticamente — no necesita config de webpack.
  turbopack: {},

  // Transpila socket.io-client y sus dependencias ESM para el bundle del cliente
  transpilePackages: [
    "socket.io-client",
    "engine.io-client",
    "engine.io-parser",
    "@socket.io/component-emitter",
  ],
};

export default nextConfig;
