import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "4 Amigos — Rompe Amistades",
  description: "Juego de cartas multijugador en tiempo real",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-black text-white overflow-hidden">{children}</body>
    </html>
  );
}
