// =============================================================================
// 4 Amigos — Room Manager
// Gestiona las salas de juego en RAM. Crea, busca, destruye salas.
// Máximo 4 jugadores por sala.
// =============================================================================

import { nanoid } from "nanoid";
import type { Room, GameState, Player } from "./types/game.js";
import { createInitialGameState, buildGameStateView } from "./gameLogic.js";
import { config } from "./config.js";

const MAX_PLAYERS = 4;
const ROOM_EXPIRY_MS = 1000 * 60 * 60; // 1 hora sin actividad

// ─────────────────────────── Almacén en RAM ──────────────────────────────────

const rooms = new Map<string, Room>();
const playerRoomIndex = new Map<string, string>(); // playerId → roomId

// ─────────────────────────── Utilidades ──────────────────────────────────────

function generateRoomId(): string {
	return nanoid(6).toUpperCase(); // Ej: "A8K3Z2"
}

function now(): number {
	return Date.now();
}

// ─────────────────────────── API del Room Manager ────────────────────────────

/** Busca o crea una sala con el roomId dado. Retorna null si está llena. */
export function joinRoom(
	roomId: string,
	playerId: string,
	playerName: string,
): { room: Room; isNew: boolean } | { error: string } {
	let room = rooms.get(roomId);

	if (!room) {
		// Crear la sala en fase lobby
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

	// ¿El jugador ya está en la sala? (reconexión)
	const existing = gameState.players.find((p) => p.id === playerId);
	if (existing) {
		existing.isConnected = true;
		playerRoomIndex.set(playerId, roomId);
		return { room, isNew: false };
	}

	// Sala llena
	if (gameState.players.length >= MAX_PLAYERS) {
		return { error: "La sala está llena (máximo 4 jugadores)" };
	}

	// Sala ya iniciada
	if (gameState.phase !== "lobby") {
		return { error: "La partida ya está en curso" };
	}

	// Añadir jugador al lobby
	const AVATAR_COLORS = ["#FF6A1A", "#E8FF3D", "#9DE5FF", "#FF2244"];
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
	};

	gameState.players.push(newPlayer);
	playerRoomIndex.set(playerId, roomId);

	return { room, isNew: true };
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

	// Repartir cartas e inicializar el estado de juego
	const playerDefs = gameState.players.map((p) => ({ id: p.id, name: p.name }));
	const newState = createInitialGameState(playerDefs);
	room.gameState = newState;

	return { ok: true, room };
}

/** Marca a un jugador como desconectado */
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

	// Si todos se desconectaron, marcar para limpieza
	const allGone = room.gameState.players.every((p) => !p.isConnected);
	if (allGone) {
		scheduleRoomCleanup(roomId);
	}

	return { roomId, room };
}

/** Elimina un jugador de la sala (abandono) */
export function leaveRoom(playerId: string): { roomId: string | null } {
	const roomId = playerRoomIndex.get(playerId) ?? null;
	if (!roomId) return { roomId: null };

	const room = rooms.get(roomId);
	if (room) {
		room.gameState.players = room.gameState.players.filter(
			(p) => p.id !== playerId,
		);

		// Reconectar índice de jugador actual si es necesario
		if (room.gameState.currentPlayerIndex >= room.gameState.players.length) {
			room.gameState.currentPlayerIndex = 0;
		}

		if (room.gameState.players.length === 0) {
			rooms.delete(roomId);
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

/** Construye la vista sanitizada para cada jugador en la sala */
export function buildRoomViews(
	room: Room,
): Map<string, ReturnType<typeof buildGameStateView>> {
	const views = new Map<string, ReturnType<typeof buildGameStateView>>();
	for (const player of room.gameState.players) {
		views.set(
			player.id,
			buildGameStateView(room.gameState, player.id, room.id),
		);
	}
	return views;
}

// ─────────────────────────── Limpieza ────────────────────────────────────────

function scheduleRoomCleanup(roomId: string): void {
	setTimeout(() => {
		const room = rooms.get(roomId);
		if (!room) return;

		const allGone = room.gameState.players.every((p) => !p.isConnected);
		if (allGone) {
			// Limpiar índice de jugadores
			for (const player of room.gameState.players) {
				playerRoomIndex.delete(player.id);
			}
			rooms.delete(roomId);
			console.log(`[RoomManager] Sala ${roomId} eliminada por inactividad`);
		}
	}, ROOM_EXPIRY_MS);
}

/** Limpia salas expiradas (para llamar periódicamente) */
export function purgeExpiredRooms(): void {
	const cutoff = now() - ROOM_EXPIRY_MS;
	for (const [id, room] of rooms.entries()) {
		if (room.createdAt < cutoff) {
			for (const player of room.gameState.players) {
				playerRoomIndex.delete(player.id);
			}
			rooms.delete(id);
			console.log(`[RoomManager] Sala ${id} eliminada por expiración`);
		}
	}
}

// ─────────────────────────── Sanitización de entrada ─────────────────────────

/** Sanitiza el nombre del jugador: limita longitud y elimina HTML */
function sanitizeName(raw: string): string {
	return (
		raw
			.replace(/<[^>]*>/g, "") // strip HTML tags
			.replace(/[^\p{L}\p{N} _\-\.]/gu, "") // solo letras, números, guiones, puntos
			.trim()
			.slice(0, 20) || "Jugador"
	);
}

/** Reinicia una sala al lobby para una revancha (mantiene los mismos jugadores) */
export function resetRoom(
	roomId: string,
): { ok: true } | { ok: false; error: string } {
	const room = rooms.get(roomId);
	if (!room) return { ok: false, error: "Sala no encontrada" };

	const freshState: GameState = {
		phase: "lobby",
		players: room.gameState.players.map((p) => ({
			id: p.id,
			name: p.name,
			avatarColor: p.avatarColor,
			hand: [],
			tableUp: [],
			tableDown: [],
			status: "waiting",
			isConnected: p.isConnected,
			seatIndex: p.seatIndex,
			penaltyCount: 0,
		})),
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

	room.gameState = freshState;
	return { ok: true };
}

// ─────────────────────────── Debug ───────────────────────────────────────────

export function getRoomStats() {
	return {
		rooms: rooms.size,
		players: [...rooms.values()].reduce(
			(acc, r) => acc + r.gameState.players.length,
			0,
		),
	};
}
