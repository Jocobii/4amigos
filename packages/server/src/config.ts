// =============================================================================
// 4 Amigos — Configuración del servidor
// Lee variables de entorno una sola vez. Importar desde aquí, nunca
// acceder a process.env directamente en otros módulos.
// =============================================================================

const isDev = process.env.NODE_ENV !== "production";

export const config = {
	/** Puerto en el que escucha el servidor WebSocket. */
	port: parseInt(process.env.PORT ?? "3001", 10),

	/** Origen permitido para CORS (cliente web). */
	clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",

	/** true en desarrollo, false en producción. */
	isDev,

	/**
	 * Mínimo de jugadores para poder iniciar una partida.
	 * En desarrollo basta con 1 para testear en solitario.
	 * En producción se exigen 2 como mínimo.
	 * Sobrescribible con la variable MIN_PLAYERS en .env.
	 */
	minPlayers: process.env.MIN_PLAYERS
		? parseInt(process.env.MIN_PLAYERS, 10)
		: isDev
			? 1
			: 2,

	/**
	 * Mazo corto para desarrollo: usa 1 sola baraja (52 cartas) en lugar de 2.
	 * Actívalo poniendo DEV_SHORT_DECK=true en .env, o cambia el default aquí.
	 * En producción siempre es false (2 barajas completas).
	 */
	devShortDeck: isDev && process.env.DEV_SHORT_DECK !== "false",
} as const;
