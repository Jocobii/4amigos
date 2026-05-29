// =============================================================================
// 4 Amigos — Servidor Autoritario
// HTTP (health) + WebSocket puro (ws) | Compatible con Godot WebSocketPeer.
//
// Protocolo de mensajes JSON:
//   C → S:  { "event": "JOIN_ROOM", "payload": { ... } }
//   S → C:  { "event": "ROOM_STATE", "payload": { ... } }
//
// gameLogic.ts y roomManager.ts permanecen intactos.
// =============================================================================

import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";

import type {
	JoinRoomPayload,
	PlayCardPayload,
	InterceptTurnPayload,
	FlipBlindPayload,
} from "./types/game.js";

import {
	joinRoom,
	reconnectPlayer,
	reconnectPlayerByName,
	startGame,
	handleDisconnect,
	getRoom,
	buildRoomViews,
	purgeExpiredRooms,
	getRoomStats,
	resetRoom,
} from "./roomManager.js";

import { playCard, takePile, interceptTurn } from "./gameLogic.js";

import { config } from "./config.js";

// ─────────────────────────── Config ──────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const MAX_PLAYERS = 4;
const TURN_TIMEOUT_MS = 17_000;

// ─────────────────────────── Estructuras de conexión ─────────────────────────

interface ClientData {
	playerId: string;
	playerName: string;
	roomId: string;
	clientType: import("./types/game.js").ClientType;
}

/** ws → datos del cliente */
const clientMap = new Map<WebSocket, ClientData>();
/** playerId → ws (para envíos directos) */
const idMap = new Map<string, WebSocket>();
/**
 * playerId → ClientType. Persiste aunque cambie el ws (reconexión) para que
 * emitRoomState sepa a quién entregar las manos de los oponentes (clientes 3D).
 */
const clientTypes = new Map<string, import("./types/game.js").ClientType>();
/** roomId → Set de playerIds (equivalente a socket.io rooms) */
const roomSockets = new Map<string, Set<string>>();

// ─────────────────────────── Helpers de envío ─────────────────────────────────

/** Envía un evento JSON a un ws específico. */
function send(ws: WebSocket, event: string, payload?: unknown): void {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ event, payload: payload ?? null }));
	}
}

/** Envía un evento JSON a un jugador por su id. */
function sendToPlayer(
	playerId: string,
	event: string,
	payload?: unknown,
): void {
	const ws = idMap.get(playerId);
	if (ws) send(ws, event, payload);
}

/** Emite un evento a todos los jugadores de una sala. */
function broadcastToRoom(
	roomId: string,
	event: string,
	payload?: unknown,
): void {
	const ids = roomSockets.get(roomId);
	if (!ids) return;
	for (const id of ids) {
		sendToPlayer(id, event, payload);
	}
}

/** Agrega un playerId a la sala (equivalente a socket.join). */
function joinSocketRoom(roomId: string, playerId: string): void {
	if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
	roomSockets.get(roomId)!.add(playerId);
}

/** Elimina un playerId de todas las salas de socket. */
function leaveAllSocketRooms(playerId: string): void {
	for (const [, members] of roomSockets) {
		members.delete(playerId);
	}
}

// ─────────────────────────── Turn Timer ──────────────────────────────────────

const roomTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resetTurnTimer(roomId: string): void {
	const prev = roomTurnTimers.get(roomId);
	if (prev) clearTimeout(prev);

	const timer = setTimeout(() => {
		const room = getRoom(roomId);
		if (!room || room.gameState.phase !== "playing") return;

		const currentPlayer =
			room.gameState.players[room.gameState.currentPlayerIndex];
		if (!currentPlayer) return;

		console.log(
			`[Room ${roomId}] Tiempo agotado — auto-penalizando a ${currentPlayer.name}`,
		);

		const result = takePile(room.gameState, currentPlayer.id);
		if (result.ok) {
			sendToPlayer(currentPlayer.id, "PLAY_RESULT", {
				success: true,
				code: "took_pile",
				message: "Tiempo agotado — recogiste el pozo",
				penaltyApplied: true,
			});
			emitRoomState(roomId);
			resetTurnTimer(roomId);
		}
	}, TURN_TIMEOUT_MS);

	roomTurnTimers.set(roomId, timer);
}

function cancelTurnTimer(roomId: string): void {
	const timer = roomTurnTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		roomTurnTimers.delete(roomId);
	}
}

// ─────────────────────────── Helper: emitir estado sanitizado ─────────────────

function emitRoomState(roomId: string): void {
	const room = getRoom(roomId);
	if (!room) return;

	const views = buildRoomViews(room, clientTypes);
	for (const [playerId, view] of views.entries()) {
		sendToPlayer(playerId, "ROOM_STATE", { view });
	}
}

function emitGameEnd(roomId: string): void {
	const room = getRoom(roomId);
	if (!room) return;

	const players = room.gameState.players;
	const ordered = room.gameState.finishOrder.map((id, idx) => {
		const p = players.find((pl) => pl.id === id);
		return { id, name: p?.name ?? "?", rank: idx + 1 };
	});

	const winner = ordered[0];
	const loser = ordered[ordered.length - 1];

	broadcastToRoom(roomId, "GAME_END", {
		finishOrder: ordered,
		winnerId: winner?.id ?? "",
		winnerName: winner?.name ?? "?",
		loserId: loser?.id ?? "",
		loserName: loser?.name ?? "?",
	});

	console.log(
		`[Room ${roomId}] Fin de partida — Ganador: ${winner?.name} | Shithead: ${loser?.name}`,
	);
}

// ─────────────────────────── Validación de entrada ───────────────────────────

function isValidRoomId(id: unknown): id is string {
	return typeof id === "string" && /^[A-Z0-9]{2,10}$/.test(id.trim());
}

function isValidPlayerName(name: unknown): name is string {
	return (
		typeof name === "string" &&
		name.trim().length >= 1 &&
		name.trim().length <= 30
	);
}

function isValidCardIds(ids: unknown): ids is string[] {
	return (
		Array.isArray(ids) &&
		ids.length >= 1 &&
		ids.length <= 4 &&
		ids.every((id) => typeof id === "string" && id.length > 0)
	);
}

// ─────────────────────────── Manejadores de mensajes ─────────────────────────

function handleMessage(ws: WebSocket, event: string, payload: unknown): void {
	// playerId se lee desde clientMap para que refleje reconexiones
	const data = clientMap.get(ws);
	const playerId = data?.playerId ?? "";

	// ── JOIN_ROOM ────────────────────────────────────────────────────────────────
	if (event === "JOIN_ROOM") {
		const { roomId, playerName, reconnectToken, clientType } = (payload ??
			{}) as Partial<JoinRoomPayload>;

		// Sólo aceptamos "godot3d" como opt-in explícito; cualquier otra cosa → "web".
		const resolvedClientType: import("./types/game.js").ClientType =
			clientType === "godot3d" ? "godot3d" : "web";

		if (!isValidRoomId(roomId)) {
			send(ws, "ERROR", {
				code: "INVALID_ROOM_ID",
				message: "ID de sala inválido (usa solo letras y números)",
			});
			return;
		}
		if (!isValidPlayerName(playerName)) {
			send(ws, "ERROR", {
				code: "INVALID_NAME",
				message: "Nombre inválido (1-30 caracteres)",
			});
			return;
		}

		const trimmedRoom = roomId.trim().toUpperCase();

		// ── Intento de reconexión ──────────────────────────────────────────────────
		if (reconnectToken && typeof reconnectToken === "string") {
			const recon = reconnectPlayer(trimmedRoom, reconnectToken);

			if (!recon.ok) {
				send(ws, "ERROR", { code: "RECONNECT_FAILED", message: recon.error });
				return;
			}

			const oldPlayerId = recon.playerId;
			const currentSocketId = data?.playerId ?? "";

			// Limpiar mapas del socket temporal asignado en la conexión
			if (currentSocketId && currentSocketId !== oldPlayerId) {
				idMap.delete(currentSocketId);
				leaveAllSocketRooms(currentSocketId);
			}

			// Reasignar el WebSocket al ID de juego original
			idMap.set(oldPlayerId, ws);
			clientMap.set(ws, {
				playerId: oldPlayerId,
				playerName: playerName!.trim(),
				roomId: trimmedRoom,
				clientType: resolvedClientType,
			});
			clientTypes.set(oldPlayerId, resolvedClientType);
			joinSocketRoom(trimmedRoom, oldPlayerId);

			console.log(
				`[Room ${trimmedRoom}] "${playerName}" reconectado (id: ${oldPlayerId})`,
			);

			// Confirmar reconexión al cliente con su playerId original
			send(ws, "RECONNECTED", { playerId: oldPlayerId });
			emitRoomState(trimmedRoom);
			return;
		}

		// ── Join normal ────────────────────────────────────────────────────────────
		const result = joinRoom(trimmedRoom, playerId, playerName!.trim());

		if ("error" in result) {
			// Caso especial: la partida ya inició y el jugador YA estaba en la sala
			// (ocurre cuando el cliente Godot cambia de escena y re-envía JOIN_ROOM
			// para solicitar un ROOM_STATE fresco — no es un error real).
			const existingRoom = getRoom(trimmedRoom);
			const alreadyInGame =
				existingRoom?.gameState.phase !== "lobby" &&
				existingRoom?.gameState.players.some((p) => p.id === playerId);

			if (alreadyInGame) {
				clientTypes.set(playerId, resolvedClientType);
				joinSocketRoom(trimmedRoom, playerId);
				console.log(
					`[Room ${trimmedRoom}] "${playerName}" re-solicitó estado (partida en curso) → emitiendo ROOM_STATE`,
				);
				emitRoomState(trimmedRoom);
				return;
			}

			send(ws, "ERROR", { code: "JOIN_FAILED", message: result.error });
			return;
		}

		const { room, reconnectToken: token } = result;

		clientMap.set(ws, {
			playerId,
			playerName: playerName!.trim(),
			roomId: trimmedRoom,
			clientType: resolvedClientType,
		});
		clientTypes.set(playerId, resolvedClientType);
		joinSocketRoom(trimmedRoom, playerId);

		console.log(
			`[Room ${trimmedRoom}] "${playerName}" se unió (${room.gameState.players.length}/${MAX_PLAYERS}) [${resolvedClientType}]`,
		);

		// Confirmar join con el token de reconexión — el cliente DEBE guardarlo
		send(ws, "JOINED", { playerId, reconnectToken: token });
		emitRoomState(trimmedRoom);

		// Auto-iniciar si la sala está llena
		if (
			room.gameState.players.length >= MAX_PLAYERS &&
			room.gameState.phase === "lobby"
		) {
			const startResult = startGame(trimmedRoom);
			if (startResult.ok) {
				const playerOrder = startResult.room.gameState.players.map((p) => ({
					id: p.id,
					name: p.name,
					seatIndex: p.seatIndex,
				}));
				broadcastToRoom(trimmedRoom, "GAME_START", {
					roomId: trimmedRoom,
					playerOrder,
				});
				emitRoomState(trimmedRoom);
				resetTurnTimer(trimmedRoom);
				console.log(
					`[Room ${trimmedRoom}] Partida iniciada automáticamente (sala llena)`,
				);
			}
		}
		return;
	}

	// Los handlers siguientes requieren estar en una sala
	if (!data?.roomId) {
		send(ws, "ERROR", {
			code: "NOT_IN_ROOM",
			message: "No estás en ninguna sala",
		});
		return;
	}

	const roomId = data.roomId;

	// ── READY ────────────────────────────────────────────────────────────────────
	if (event === "READY") {
		const room = getRoom(roomId);
		if (!room) {
			send(ws, "ERROR", {
				code: "ROOM_NOT_FOUND",
				message: "Sala no encontrada",
			});
			return;
		}
		if (room.gameState.phase !== "lobby") {
			send(ws, "ERROR", {
				code: "ALREADY_STARTED",
				message: "La partida ya inició",
			});
			return;
		}
		if (room.gameState.players.length < config.minPlayers) {
			send(ws, "ERROR", {
				code: "NOT_ENOUGH_PLAYERS",
				message: `Se necesitan al menos ${config.minPlayers} jugador(es) para iniciar`,
			});
			return;
		}

		const startResult = startGame(roomId);
		if (!startResult.ok) {
			send(ws, "ERROR", { code: "START_FAILED", message: startResult.error });
			return;
		}

		const playerOrder = startResult.room.gameState.players.map((p) => ({
			id: p.id,
			name: p.name,
			seatIndex: p.seatIndex,
		}));

		broadcastToRoom(roomId, "GAME_START", { roomId, playerOrder });
		emitRoomState(roomId);
		resetTurnTimer(roomId);
		console.log(`[Room ${roomId}] Partida iniciada manualmente`);
		return;
	}

	// ── PLAY_CARD ────────────────────────────────────────────────────────────────
	if (event === "PLAY_CARD") {
		const { cardIds } = (payload ?? {}) as Partial<PlayCardPayload>;
		if (!isValidCardIds(cardIds)) {
			send(ws, "PLAY_RESULT", {
				success: false,
				code: "invalid_card",
				message: "Payload inválido: cardIds debe ser un array de 1-4 strings",
			});
			return;
		}

		const room = getRoom(roomId);
		if (!room) return;

		const result = playCard(room.gameState, playerId, cardIds);

		if (!result.ok) {
			send(ws, "PLAY_RESULT", {
				success: false,
				code: result.code,
				message: result.message,
			});
			return;
		}

		send(ws, "PLAY_RESULT", {
			success: true,
			code: "ok",
			message: result.burned ? "¡Pozo quemado! 🔥" : "Carta jugada",
		});

		emitRoomState(roomId);

		if (result.gameOver || room.gameState.phase === "finished") {
			cancelTurnTimer(roomId);
			emitGameEnd(roomId);
		} else {
			resetTurnTimer(roomId);
		}
		return;
	}

	// ── TAKE_PILE ────────────────────────────────────────────────────────────────
	if (event === "TAKE_PILE") {
		const room = getRoom(roomId);
		if (!room) return;

		const result = takePile(room.gameState, playerId);

		if (!result.ok) {
			send(ws, "PLAY_RESULT", {
				success: false,
				code: result.code,
				message: result.message,
			});
			return;
		}

		send(ws, "PLAY_RESULT", {
			success: true,
			code: "took_pile",
			message: "Recogiste el pozo 💀",
			penaltyApplied: true,
		});

		emitRoomState(roomId);
		return;
	}

	// ── FLIP_BLIND ───────────────────────────────────────────────────────────────
	if (event === "FLIP_BLIND") {
		const { cardId } = (payload ?? {}) as Partial<FlipBlindPayload>;
		if (typeof cardId !== "string" || !cardId) {
			send(ws, "ERROR", {
				code: "INVALID_PAYLOAD",
				message: "cardId inválido",
			});
			return;
		}

		const room = getRoom(roomId);
		if (!room) return;

		const result = playCard(room.gameState, playerId, [cardId]);

		if (!result.ok) {
			send(ws, "PLAY_RESULT", {
				success: false,
				code: result.code,
				message: result.message,
			});
			return;
		}

		send(ws, "PLAY_RESULT", {
			success: true,
			code: "ok",
			message: "Carta ciega volteada",
		});
		emitRoomState(roomId);

		if (result.gameOver || room.gameState.phase === "finished") {
			cancelTurnTimer(roomId);
			emitGameEnd(roomId);
		} else {
			resetTurnTimer(roomId);
		}
		return;
	}

	// ── INTERCEPT_TURN ───────────────────────────────────────────────────────────
	if (event === "INTERCEPT_TURN") {
		const { cardIds } = (payload ?? {}) as Partial<InterceptTurnPayload>;
		const interceptorName = data.playerName ?? "Jugador";

		if (!isValidCardIds(cardIds)) {
			send(ws, "INTERCEPT_RESULT", {
				success: false,
				interceptorId: playerId,
				interceptorName,
				message: "Payload inválido",
				penaltyApplied: false,
			});
			return;
		}

		const room = getRoom(roomId);
		if (!room) return;

		const result = interceptTurn(room.gameState, playerId, cardIds);

		if (!result.ok) {
			broadcastToRoom(roomId, "INTERCEPT_RESULT", {
				success: false,
				interceptorId: playerId,
				interceptorName,
				penaltyApplied: result.penaltyApplied,
				message: result.message,
			});
			emitRoomState(roomId);
			return;
		}

		broadcastToRoom(roomId, "INTERCEPT_RESULT", {
			success: true,
			interceptorId: playerId,
			interceptorName,
			message: `⚡ ¡${interceptorName} robó el turno!`,
		});

		emitRoomState(roomId);
		resetTurnTimer(roomId);
		console.log(`[Room ${roomId}] Intercepción exitosa por ${interceptorName}`);
		return;
	}

	// ── SEND_REACTION ────────────────────────────────────────────────────────────
	if (event === "SEND_REACTION") {
		const emoji =
			typeof (payload as any)?.emoji === "string"
				? (payload as any).emoji.slice(0, 8).trim()
				: null;
		if (!emoji) return;

		const room = getRoom(roomId);
		const player = room?.gameState.players.find((p) => p.id === playerId);
		const playerColor = player?.avatarColor ?? "#FF6A1A";

		broadcastToRoom(roomId, "PLAYER_REACTION", {
			playerId,
			playerName: data.playerName ?? "Jugador",
			playerColor,
			emoji,
		});
		return;
	}

	// ── RESTART_GAME ─────────────────────────────────────────────────────────────
	if (event === "RESTART_GAME") {
		const result = resetRoom(roomId);
		if (!result.ok) {
			send(ws, "ERROR", { code: "restart_failed", message: result.error });
			return;
		}

		cancelTurnTimer(roomId);
		broadcastToRoom(roomId, "GAME_RESTARTED", null);
		emitRoomState(roomId);
		console.log(`[Room ${roomId}] Partida reiniciada`);
		return;
	}

	console.warn(`[WS] Evento desconocido: "${event}" de ${playerId}`);
}

// ─────────────────────────── HTTP Server (health) ─────────────────────────────

const httpServer = http.createServer((req, res) => {
	if (req.url === "/health" && req.method === "GET") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({ ok: true, ...getRoomStats(), timestamp: Date.now() }),
		);
		return;
	}
	res.writeHead(404);
	res.end();
});

// ─────────────────────────── WebSocket Server ────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
	const socketId = nanoid(12);
	idMap.set(socketId, ws);

	// Datos del cliente: se usan socketId como playerId provisional hasta JOIN_ROOM
	clientMap.set(ws, {
		playerId: socketId,
		playerName: "",
		roomId: "",
		clientType: "web",
	});

	console.log(`[WS] Conexión: ${socketId}`);

	// Confirmar conexión con el ID provisional
	send(ws, "CONNECTED", { playerId: socketId });

	ws.on("message", (raw) => {
		let parsed: { event: string; payload?: unknown };

		try {
			parsed = JSON.parse(raw.toString());
		} catch {
			send(ws, "ERROR", {
				code: "INVALID_JSON",
				message: "El mensaje no es JSON válido",
			});
			return;
		}

		const { event, payload } = parsed;
		if (typeof event !== "string") {
			send(ws, "ERROR", {
				code: "MISSING_EVENT",
				message: 'Falta el campo "event"',
			});
			return;
		}

		handleMessage(ws, event, payload);
	});

	ws.on("close", (code) => {
		// Leer playerId desde clientMap (puede haber cambiado en reconexión)
		const currentData = clientMap.get(ws);
		const currentPlayerId = currentData?.playerId ?? socketId;

		console.log(`[WS] Desconexión: ${currentPlayerId} — código: ${code}`);

		idMap.delete(currentPlayerId);
		clientMap.delete(ws);
		clientTypes.delete(currentPlayerId);
		leaveAllSocketRooms(currentPlayerId);

		const { roomId } = handleDisconnect(currentPlayerId);
		if (roomId) emitRoomState(roomId);
	});

	ws.on("error", (err) => {
		console.error(`[WS] Error en ${socketId}:`, err.message);
	});
});

// ─────────────────────────── Tareas periódicas ───────────────────────────────

setInterval(purgeExpiredRooms, 30 * 60 * 1_000);

// ─────────────────────────── Arranque ────────────────────────────────────────

httpServer.listen(PORT, () => {
	console.log(`\n[4 Amigos] — Servidor autoritario (WS puro)`);
	console.log(`    Puerto : ${PORT}`);
	console.log(`    Modo   : ${process.env["NODE_ENV"] ?? "development"}\n`);
});
