// =============================================================================
// 4 Amigos — Tipos Base del Juego
// Servidor Autoritario: estos tipos son la fuente de verdad.
// La versión en el cliente (src/shared/types/game.ts) es un espejo.
// =============================================================================

// ─────────────────────────── Primitivos de carta ─────────────────────────────

export type Suit = "oros" | "copas" | "espadas" | "bastos";

export type Rank =
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "10"
	| "J"
	| "Q"
	| "K"
	| "A";

export interface Card {
	/** Identificador único (deckIndex_suit_rank). Nunca revelado si está boca abajo */
	readonly id: string;
	readonly rank: Rank;
	readonly suit: Suit;
}

/**
 * Representación de una carta boca abajo desde la perspectiva del cliente.
 * El id puede estar oculto o reemplazado por un placeholder, según la fase.
 */
export interface CardBack {
	readonly id: string; // placeholder — no contiene rank/suit
	readonly faceDown: true;
}

export type CardView = Card | CardBack;

/**
 * Tipo de cliente conectado. Determina cuánta información se le envía.
 *  - "web":     cliente 2D estándar. Recibe la vista totalmente sanitizada.
 *  - "godot3d": cliente 3D inmersivo. Recibe además las cartas de la mano de
 *               los oponentes para poder renderizarlas físicamente. La justicia
 *               la impone el RENDER (las cartas se ven de espaldas y sólo se
 *               alcanzan a leer de refilón al girar). NO es anti-trampa fuerte:
 *               sólo habilitar en builds/salas de confianza.
 */
export type ClientType = "web" | "godot3d";

// ─────────────────────────── Estado del jugador ───────────────────────────────

export type PlayerStatus = "waiting" | "playing" | "finished" | "disconnected";

/** Estado completo en el servidor (nunca se envía completo al cliente) */
export interface Player {
	readonly id: string; // socket.id del primer JOIN_ROOM (persiste en la partida)
	readonly name: string;
	readonly avatarColor: string; // hex
	hand: Card[]; // cartas en la mano
	tableUp: Card[]; // 4 cartas boca arriba sobre las ciegas
	tableDown: Card[]; // 4 cartas ciegas (boca abajo)
	status: PlayerStatus;
	isConnected: boolean;
	seatIndex: number; // 0-3, define posición en la mesa
	/** Cuántas veces el jugador ha robado el pozo como castigo */
	penaltyCount: number;
	/**
	 * Token opaco (nanoid 20) usado para reconexión.
	 * NUNCA se incluye en GameStateView ni en ninguna vista de cliente.
	 */
	reconnectToken: string;
}

/**
 * Vista sanitizada del jugador para OTROS jugadores.
 * Las cartas de la mano se ocultan; las de la mesa se revelan sólo si están boca arriba.
 */
export interface PlayerView {
	readonly id: string;
	readonly name: string;
	readonly avatarColor: string;
	readonly seatIndex: number;
	readonly status: PlayerStatus;
	readonly isConnected: boolean;
	readonly penaltyCount: number;
	/** Sólo el conteo de cartas en la mano */
	readonly handCount: number;
	/**
	 * Cartas reales de la mano del oponente. SÓLO se incluye cuando el cliente
	 * destinatario es "godot3d" (ver ClientType). Para clientes web es undefined.
	 * El cliente 3D las renderiza de espaldas; sólo se leen al girar la cámara.
	 */
	readonly hand?: Card[];
	/** Las boca arriba son visibles para todos */
	readonly tableUp: Card[];
	/** Las ciegas: sólo el conteo y placeholders sin rank/suit */
	readonly tableDownCount: number;
	readonly tableDown: CardBack[];
}

/** Vista del jugador PARA SÍ MISMO — acceso completo a su propia mano */
export interface SelfView extends Omit<PlayerView, "handCount"> {
	readonly hand: Card[];
	/** El jugador puede ver sus propias cartas boca abajo sólo al voltearlas */
	readonly tableDown: CardBack[]; // siguen siendo ciegas hasta voltear
}

// ─────────────────────────── Estado de la partida ────────────────────────────

export type GamePhase =
	| "lobby" // Sala abierta, esperando jugadores
	| "dealing" // Repartiendo cartas (transición)
	| "playing" // Partida en curso
	| "finished"; // Alguien ganó

export type TurnConstraint =
	| "normal" // Jugar carta ≥ tope del pozo
	| "mirror" // Después de un 7: jugar carta ≤ 7 (o 2)
	| "blind"; // El jugador debe voltear una ciega

export interface DiscardPile {
	/** Todas las cartas del pozo (la última es el tope) */
	cards: Card[];
	/** Tope del pozo — null si el pozo está vacío (recién quemado) */
	topCard: Card | null;
}

export interface InterceptState {
	/** La intercepción es posible cuando hay un 5 en el tope del pozo */
	isOpen: boolean;
	/** ID del jugador activo cuyo turno está siendo interrumpido */
	activePlayerId: string | null;
	/** Timestamp (ms) cuando se abrió la ventana de intercepción */
	openedAt: number | null;
}

/** Estado completo de la partida en RAM del servidor */
export interface GameState {
	phase: GamePhase;
	players: Player[]; // orden fijo por seatIndex
	deck: Card[]; // mazo restante (boca abajo)
	discardPile: DiscardPile;
	currentPlayerIndex: number; // índice en players[]
	turnConstraint: TurnConstraint;
	intercept: InterceptState;
	round: number;
	/** Jugador que ya terminó, en orden de clasificación */
	finishOrder: string[]; // playerIds
	lastActivity: ActivityEvent[];
	/** Timestamp (ms) de cuando empezo el turno actual */
	turnStartedAt: number;
}

// ─────────────────────────── Estado de la sala (Room) ────────────────────────

export interface Room {
	readonly id: string;
	gameState: GameState;
	createdAt: number;
}

// ─────────────────────────── Vistas sanitizadas (para el cliente) ─────────────

/**
 * Estado del juego tal como lo ve UN jugador específico.
 * El servidor construye una copia de esto por cada cliente antes de emitir.
 */
export interface GameStateView {
	phase: GamePhase;
	/** El jugador receptor ve sus propias cartas completas */
	self: SelfView;
	/** Los demás jugadores con información parcial */
	opponents: PlayerView[];
	/** Solo el tope del pozo es visible; el tamaño total sí se muestra */
	discardTopCard: Card | null;
	discardPileCount: number;
	/** Sólo el tamaño del mazo — las cartas del mazo no se revelan */
	deckCount: number;
	currentPlayerId: string;
	turnConstraint: TurnConstraint;
	intercept: InterceptState;
	round: number;
	finishOrder: string[];
	lastActivity: ActivityEvent[];
	roomId: string;
	turnStartedAt: number;
	/** Server's Date.now() at view build time — clients use this to correct clock skew */
	serverNow: number;
}

// ─────────────────────────── Eventos de actividad ─────────────────────────────

export type ActivityKind =
	| "play"
	| "take_pile"
	| "intercept"
	| "intercept_fail"
	| "burn"
	| "flip_blind"
	| "join"
	| "leave"
	| "win";

export interface ActivityEvent {
	id: string;
	kind: ActivityKind;
	actorId: string;
	actorName: string;
	actorColor: string;
	targetId?: string;
	targetName?: string;
	cardRanks?: string[];
	timestamp: number;
}

// =============================================================================
// Payloads de eventos Socket.io
// Convención: C→S = cliente emite | S→C = servidor emite
// =============================================================================

// ─── C→S ──────────────────────────────────────────────────────────────────────

export interface JoinRoomPayload {
	roomId: string;
	playerName: string;
	/** Presente sólo en reconexión — token recibido en el evento JOINED del join original */
	reconnectToken?: string;
	/** Tipo de cliente. Si se omite, el servidor asume "web" (vista sanitizada). */
	clientType?: ClientType;
}

export interface PlayCardPayload {
	cardIds: string[]; // Uno o más cardId de la mano / mesa
}

export interface InterceptTurnPayload {
	cardIds: string[]; // Debe ser exactamente un 5
}

export interface FlipBlindPayload {
	cardId: string; // El placeholder-id de la ciega a voltear
}

// ─── S→C ──────────────────────────────────────────────────────────────────────

export interface RoomStatePayload {
	view: GameStateView;
}

export interface PlayResultPayload {
	success: boolean;
	code:
		| "ok"
		| "invalid_card"
		| "wrong_constraint"
		| "not_your_turn"
		| "card_not_found"
		| "took_pile"
		| "already_finished";
	message: string;
	/** Si el jugador tuvo que robar el pozo por fallo, se indica aquí */
	penaltyApplied?: boolean;
}

export interface InterceptResultPayload {
	success: boolean;
	interceptorId: string;
	interceptorName: string;
	penaltyApplied?: boolean;
	message: string;
}

export interface GameStartPayload {
	roomId: string;
	playerOrder: Array<{ id: string; name: string; seatIndex: number }>;
}

export interface GameEndPayload {
	finishOrder: Array<{ id: string; name: string; rank: number }>;
	winnerId: string;
	winnerName: string;
	loserId: string;
	loserName: string;
}

export interface ErrorPayload {
	code: string;
	message: string;
}

// ─── Mapa de eventos (tipado fuerte para socket.io) ───────────────────────────

export interface SendReactionPayload {
	emoji: string;
}
export interface PlayerReactionPayload {
	playerId: string;
	playerName: string;
	playerColor: string;
	emoji: string;
}

/** Eventos que el CLIENTE emite al servidor */
export interface ClientToServerEvents {
	JOIN_ROOM: (payload: JoinRoomPayload) => void;
	READY: () => void;
	PLAY_CARD: (payload: PlayCardPayload) => void;
	TAKE_PILE: () => void;
	FLIP_BLIND: (payload: FlipBlindPayload) => void;
	INTERCEPT_TURN: (payload: InterceptTurnPayload) => void;
	RESTART_GAME: () => void;
	SEND_REACTION: (payload: SendReactionPayload) => void;
}

/** Eventos que el SERVIDOR emite al cliente */
export interface ServerToClientEvents {
	ROOM_STATE: (payload: RoomStatePayload) => void;
	PLAY_RESULT: (payload: PlayResultPayload) => void;
	INTERCEPT_RESULT: (payload: InterceptResultPayload) => void;
	GAME_START: (payload: GameStartPayload) => void;
	GAME_END: (payload: GameEndPayload) => void;
	GAME_RESTARTED: () => void;
	PLAYER_REACTION: (payload: PlayerReactionPayload) => void;
	ERROR: (payload: ErrorPayload) => void;
	/** Confirmación de join nuevo — incluye reconnectToken para guardar */
	JOINED: (payload: { playerId: string; reconnectToken: string }) => void;
	/** Confirmación de reconexión exitosa */
	RECONNECTED: (payload: { playerId: string }) => void;
}

/** Eventos inter-servidor (vacío, requerido por Socket.io) */
export interface InterServerEvents {}

/** Datos adjuntos a cada socket (disponibles en todos los handlers) */
export interface SocketData {
	playerId: string;
	playerName: string;
	roomId: string;
}

/** Eventos inter-servidor (vacío, requerido por Socket.io) */
export interface InterServerEvents {}

/** Datos adjuntos a cada socket (disponibles en todos los handlers) */
export interface SocketData {
	playerId: string;
	playerName: string;
	roomId: string;
}
