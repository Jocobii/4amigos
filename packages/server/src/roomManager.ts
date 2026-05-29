// =============================================================================
// 4 Amigos — Room Manager
// Gestiona las salas de juego en RAM. Crea, busca, destruye salas.
// Máximo 4 jugadores por sala.
//
// Políticas de ciclo de vida:
//   • Sala vacía (leaveRoom sin jugadores)    → destrucción inmediata
//   • Todos desconectados (isConnected=false)  → destrucción tras RECONNECT_GRACE_MS
//   • Sala sin actividad (purge periódico)     → destrucción tras ROOM_MAX_AGE_MS
//
// Reconexión:
//   • joinRoom() devuelve un reconnectToken (nanoid 20) al primer join.
//   • El cliente debe almacenarlo; al reconectarse lo envía en JOIN_ROOM.
//   • reconnectPlayer() valida el token y restaura la sesión del jugador.
// =============================================================================

import { nanoid } from "nanoid";
import type { Room, GameState, Player } from "./types/game.js";
import { createInitialGameState, buildGameStateView } from "./gameLogic.js";
import { config } from "./config.js";

const MAX_PLAYERS = 4;
/** Tiempo de gracia cuando todos los jugadores se desconectan (5 min). */
const RECONNECT_GRACE_MS = 5 * 60 * 1_000;
/** Edad máxima de una sala sin importar actividad (2 horas). */
const ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1_000;

// ─────────────────────────── Almacén en RAM ──────────────────────────────────

const rooms = new Map<string, Room>();
/** playerId → roomId */
const playerRoomIndex = new Map<string, string>();
/** reconnectToken → playerId  (búsqueda O(1) en reconexión) */
const reconnectTokens = new Map<string, string>();
/** roomId → handle del setTimeout de limpieza pendiente */
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─────────────────────────── Utilidades ──────────────────────────────────────

function now(): number {
	return Date.now();
}

// ─────────────────────────── API del Room Manager ────────────────────────────

/**
 * Une a un jugador nuevo a la sala (crea la sala si no existe).
 * Retorna `{ room, reconnectToken }` en éxito o `{ error }` si la sala
 * está llena o la partida ya arrancó.
 *
 * NO maneja reconexión por token — eso lo hace `reconnectPlayer()`.
 */
export function joinRoom(
	roomId: string,
	playerId: string,
	playerName: string,
): { room: Room; reconnectToken: string } | { error: string } {
	// Cancelar limpieza pendiente si la sala existía vacía
	cancelCleanupTimer(roomId);

	let room = rooms.get(roomId);

	if (!room) {
		const initialState: GameState = {
			phase: "lobby",
			players: [],
			deck: [],
			discardPile: { cards: [], topCard: null },
			currentPlayerIndex: 0,
			turnConstraint: "normal",
			intercept: { isOpen: false, activePlayerId: null, openedAt: null },
			round: 1,
			finishOrder: [],
			lastActivity: [],
			turnStartedAt: 0,
		};
		room = { id: roomId, gameState: initialState, createdAt: now() };
		rooms.set(roomId, room);
	}

	const { gameState } = room;

	// Sala llena
	if (gameState.players.length >= MAX_PLAYERS) {
		return { error: "La sala está llena (máximo 4 jugadores)" };
	}

	// Sala ya iniciada — solo se entra por reconexión de token
	if (gameState.phase !== "lobby") {
		return { error: "La partida ya está en curso" };
	}

	// Añadir jugador al lobby con su token de reconexión
	const AVATAR_COLORS = ["#FF6A1A", "#E8FF3D", "#9DE5FF", "#FF2244"];
	const token = nanoid(20);

	const newPlayer: Player = {
		id: playerId,
		name: sanitizeName(playerName),
		avatarColor: AVATAR_COLORS[gameState.players.length] ?? "#FF6A1A",
		hand: [],
		tableUp: [],
		tableDown: [],
		status: "waiting",
		isConnected: true,
		seatIndex: gameState.players.length,
		penaltyCount: 0,
		reconnectToken: token,
	};

	gameState.players.push(newPlayer);
	playerRoomIndex.set(playerId, roomId);
	reconnectTokens.set(token, playerId);

	return { room, reconnectToken: token };
}

/**
 * Reconecta a un jugador usando su token opaco.
 * Si el token es válido y el jugador estaba desconectado, devuelve su
 * `playerId` original para que `server.ts` reasigne el WebSocket.
 */
export function reconnectPlayer(
	roomId: string,
	token: string,
): { ok: true; playerId: string; reconnectToken: string; room: Room } | { ok: false; error: string } {
	const room = rooms.get(roomId);
	if (!room) return { ok: false, error: "Sala no encontrada" };

	const playerId = reconnectTokens.get(token);
	if (!playerId) return { ok: false, error: "Token de reconexión inválido" };

	const player = room.gameState.players.find((p) => p.id === playerId);
	if (!player) {
		// El jugador fue removido de la sala — token ya no aplica
		reconnectTokens.delete(token);
		return { ok: false, error: "El jugador ya no está en esta sala" };
	}

	if (player.isConnected) {
		return {
			ok: false,
			error: "El jugador ya está conectado (sesión duplicada)",
		};
	}

	// Restaurar estado de conexión y cancelar limpieza pendiente
	player.isConnected = true;
	playerRoomIndex.set(playerId, roomId);
	cancelCleanupTimer(roomId);

	console.log(
		`[RoomManager] Jugador "${player.name}" reconectado a sala ${roomId}`,
	);

	return { ok: true, playerId, reconnectToken: player.reconnectToken, room };
}

/**
 * Fallback de reconexión por nombre (para clientes sin token guardado).
 * Solo aplica si la sala está en curso y hay un jugador desconectado con ese nombre.
 * Menos seguro que reconnectPlayer() — requiere conocer roomId + nombre exacto.
 */
export function reconnectPlayerByName(
	roomId: string,
	playerName: string,
): { ok: true; playerId: string; reconnectToken: string; room: Room } | { ok: false; error: string } {
	const room = rooms.get(roomId);
	if (!room) return { ok: false, error: "Sala no encontrada" };

	if (room.gameState.phase === "lobby") {
		return { ok: false, error: "La sala está en lobby — usa JOIN_ROOM normal" };
	}

	const sanitized = playerName.replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N} _\-\.]/gu, "").trim().slice(0, 20);
	const player = room.gameState.players.find(
		(p) => p.name === sanitized && !p.isConnected,
	);

	if (!player) {
		return { ok: false, error: "No hay un jugador desconectado con ese nombre en esta sala" };
	}

	player.isConnected = true;
	playerRoomIndex.set(player.id, roomId);
	cancelCleanupTimer(roomId);

	console.log(
		`[RoomManager] Jugador "${player.name}" reconectado por nombre a sala ${roomId}`,
	);

	return { ok: true, playerId: player.id, reconnectToken: player.reconnectToken, room };
}

/** Inicia la partida si hay suficientes jugadores */
export function startGame(
	roomId: string,
): { ok: true; room: Room } | { ok: false; error: string } {
	const room = rooms.get(roomId);
	if (!room) return { ok: false, error: "Sala no encontrada" };

	const { gameState } = room;
	if (gameState.phase !== "lobby") {
		return { ok: false, error: "La partida ya inició" };
	}

	if (gameState.players.length < config.minPlayers) {
		return {
			ok: false,
			error: `Se necesitan al menos ${config.minPlayers} jugador(es) para iniciar`,
		};
	}

	const playerDefs = gameState.players.map((p) => ({ id: p.id, name: p.name }));
	const newState = createInitialGameState(playerDefs);

	// Preservar los reconnectTokens en el nuevo estado
	for (const newP of newState.players) {
		const oldP = gameState.players.find((p) => p.id === newP.id);
		if (oldP) newP.reconnectToken = oldP.reconnectToken;
	}

	room.gameState = newState;
	return { ok: true, room };
}

/** Marca a un jugador como desconectado y programa limpieza si todos se van */
export function handleDisconnect(playerId: string): {
	roomId: string | null;
	room: Room | null;
} {
	const roomId = playerRoomIndex.get(playerId) ?? null;
	if (!roomId) return { roomId: null, room: null };

	const room = rooms.get(roomId) ?? null;
	if (!room) return { roomId, room: null };

	const player = room.gameState.players.find((p) => p.id === playerId);
	if (player) {
		player.isConnected = false;
	}

	// Si todos se desconectaron, destruir o programar limpieza según el entorno
	const allGone = room.gameState.players.every((p) => !p.isConnected);
	if (allGone) {
		if (config.isDev) {
			// En desarrollo: destrucción inmediata para no bloquear reruns
			for (const p of room.gameState.players) {
				playerRoomIndex.delete(p.id);
				reconnectTokens.delete(p.reconnectToken);
			}
			rooms.delete(roomId);
			console.log(`[RoomManager] [DEV] Sala ${roomId} destruida inmediatamente (modo desarrollo)`);
		} else {
			scheduleRoomCleanup(roomId);
		}
	}

	return { roomId, room };
}

/** Elimina un jugador de la sala (abandono explícito, no simple desconexión) */
export function leaveRoom(playerId: string): { roomId: string | null } {
	const roomId = playerRoomIndex.get(playerId) ?? null;
	if (!roomId) return { roomId: null };

	const room = rooms.get(roomId);
	if (room) {
		// Limpiar token del jugador que se va
		const leaving = room.gameState.players.find((p) => p.id === playerId);
		if (leaving) reconnectTokens.delete(leaving.reconnectToken);

		room.gameState.players = room.gameState.players.filter(
			(p) => p.id !== playerId,
		);

		if (room.gameState.currentPlayerIndex >= room.gameState.players.length) {
			room.gameState.currentPlayerIndex = 0;
		}

		if (room.gameState.players.length === 0) {
			// Sala completamente vacía → destrucción inmediata
			cancelCleanupTimer(roomId);
			rooms.delete(roomId);
			console.log(`[RoomManager] Sala ${roomId} destruida (sin jugadores)`);
		}
	}

	playerRoomIndex.delete(playerId);
	return { roomId };
}

/** Obtiene la sala de un jugador */
export function getRoomByPlayer(playerId: string): Room | null {
	const roomId = playerRoomIndex.get(playerId);
	if (!roomId) return null;
	return rooms.get(roomId) ?? null;
}

export function getRoom(roomId: string): Room | null {
	return rooms.get(roomId) ?? null;
}

/**
 * Construye la vista sanitizada para cada jugador conectado en la sala.
 *
 * @param clientTypes Mapa playerId -> ClientType. Los jugadores marcados como
 *        "godot3d" reciben ademas las manos reales de sus oponentes (para el
 *        render fisico 3D). Si no se pasa el mapa, todos reciben la vista web
 *        sanitizada de siempre.
 */
export function buildRoomViews(
	room: Room,
	clientTypes?: Map<string, import("./types/game.js").ClientType>,
): Map<string, ReturnType<typeof buildGameStateView>> {
	const views = new Map<string, ReturnType<typeof buildGameStateView>>();
	for (const player of room.gameState.players) {
		const revealOpponentHands = clientTypes?.get(player.id) === "godot3d";
		views.set(
			player.id,
			buildGameStateView(
				room.gameState,
				player.id,
				room.id,
				revealOpponentHands,
			),
		);
	}
	return views;
}

// ─────────────────────────── Limpieza ────────────────────────────────────────

function scheduleRoomCleanup(roomId: string): void {
	// Si ya hay un timer pendiente, no acumulamos más
	if (cleanupTimers.has(roomId)) return;

	console.log(
		`[RoomManager] Sala ${roomId} — todos desconectados. Limpieza en ${RECONNECT_GRACE_MS / 1_000}s si nadie reconecta.`,
	);

	const handle = setTimeout(() => {
		cleanupTimers.delete(roomId);

		const room = rooms.get(roomId);
		if (!room) return;

		const allGone = room.gameState.players.every((p) => !p.isConnected);
		if (!allGone) return; // alguien reconectó — no destruir

		for (const player of room.gameState.players) {
			playerRoomIndex.delete(player.id);
			reconnectTokens.delete(player.reconnectToken);
		}
		rooms.delete(roomId);
		console.log(`[RoomManager] Sala ${roomId} destruida (tiempo de gracia agotado)`);
	}, RECONNECT_GRACE_MS);

	cleanupTimers.set(roomId, handle);
}

function cancelCleanupTimer(roomId: string): void {
	const handle = cleanupTimers.get(roomId);
	if (handle) {
		clearTimeout(handle);
		cleanupTimers.delete(roomId);
	}
}

/** Limpia salas expiradas por edad máxima (llamar periódicamente) */
export function purgeExpiredRooms(): void {
	const cutoff = now() - ROOM_MAX_AGE_MS;
	for (const [id, room] of rooms.entries()) {
		if (room.createdAt < cutoff) {
			cancelCleanupTimer(id);
			for (const player of room.gameState.players) {
				playerRoomIndex.delete(player.id);
				reconnectTokens.delete(player.reconnectToken);
			}
			rooms.delete(id);
			console.log('[RoomManager] Sala ' + id + ' purgada (expiracion por edad)');
		}
	}
}

// --- Sanitizacion de entrada ---

function sanitizeName(raw: string): string {
	return (
		raw
			.replace(/<[^>]*>/g, '')
			.replace(/[^\p{L}\p{N} _\-.]/gu, '')
			.trim()
			.slice(0, 20) || 'Jugador'
	);
}

/** Reinicia una sala al lobby para una revancha (mantiene jugadores y tokens) */
export function resetRoom(
	roomId: string,
): { ok: true } | { ok: false; error: string } {
	const room = rooms.get(roomId);
	if (!room) return { ok: false, error: 'Sala no encontrada' };

	const freshState: GameState = {
		phase: 'lobby',
		players: room.gameState.players.map((p) => ({
			id: p.id,
			name: p.name,
			avatarColor: p.avatarColor,
			hand: [],
			tableUp: [],
			tableDown: [],
			status: 'waiting',
			isConnected: p.isConnected,
			seatIndex: p.seatIndex,
			penaltyCount: 0,
			reconnectToken: p.reconnectToken,
		})),
		deck: [],
		discardPile: { cards: [], topCard: null },
		currentPlayerIndex: 0,
		turnConstraint: 'normal',
		intercept: { isOpen: false, activePlayerId: null, openedAt: null },
		round: 1,
		finishOrder: [],
		lastActivity: [],
		turnStartedAt: 0,
	};

	room.gameState = freshState;
	return { ok: true };
}

// --- Debug ---

export function getRoomStats() {
	return {
		rooms: rooms.size,
		players: [...rooms.values()].reduce(
			(acc, r) => acc + r.gameState.players.length,
			0,
		),
		pendingCleanups: cleanupTimers.size,
	};
}
