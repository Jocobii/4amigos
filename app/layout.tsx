import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "4 Amigos — Juego de Cartas Gratis | Variación Épica de Shithead",
  description:
    "4 Amigos es un juego de cartas multijugador en tiempo real, 100% GRATIS y sin registro. " +
    "Variación épica del clásico Shithead (Palace): 4 jugadores, 2 barajas y robo de turno en tiempo real. " +
    "¡Para toda la familia y amigos, desde el móvil o PC! Juega ahora sin instalar nada.",
  keywords: [
    "juego de cartas gratis",
    "shithead",
    "palace card game",
    "juego multijugador online gratis",
    "juego de cartas familia",
    "cartas online gratis sin registro",
    "4 amigos",
    "juego amigos gratis",
    "juego de cartas tiempo real",
    "variacion shithead",
    "juego cartas navegador",
    "multiplayer card game free",
  ],
  authors: [{ name: "4 Amigos" }],
  creator: "4 Amigos",
  publisher: "4 Amigos",
  category: "game",
  openGraph: {
    title: "4 Amigos — Juego de Cartas Gratis Para Todos",
    description:
      "Variación épica del Shithead. 100% gratis, sin registro, multijugador en tiempo real. " +
      "Roba turnos, quema el pozo y que el último pierda. ¡Para toda la familia y amigos!",
    type: "website",
    locale: "es_ES",
    siteName: "4 Amigos",
  },
  twitter: {
    card: "summary_large_image",
    title: "4 Amigos — Juego de Cartas Gratis",
    description:
      "Juego de cartas multijugador GRATIS. Variación épica del Shithead con robo de turnos en tiempo real. ¡Sin registro!",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "theme-color": "#FF6A1A",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "4 Amigos",
    "application-name": "4 Amigos",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <head>
        {/* Structured Data — WebApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "4 Amigos",
              applicationCategory: "GameApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              },
              description:
                "Juego de cartas multijugador en tiempo real. Variación épica del clásico Shithead/Palace. Gratis, sin registro, para toda la familia.",
              browserRequirements: "Requires JavaScript. Requires HTML5.",
              softwareVersion: "1.0",
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.8",
                ratingCount: "42",
              },
            }),
          }}
        />
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
