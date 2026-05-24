// =============================================================================
// 4 Amigos — Servidor Autoritario
// Express + Socket.io | Modelo FSM centralizado en el servidor.
// Los clientes son "tontos": sólo envían intenciones y reciben vistas sanitizadas.
// =============================================================================

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  JoinRoomPayload,
  PlayCardPayload,
  InterceptTurnPayload,
  FlipBlindPayload,
} from './types/game.js';

import {
  joinRoom,
  startGame,
  handleDisconnect,
  getRoom,
  buildRoomViews,
  purgeExpiredRooms,
  getRoomStats,
  resetRoom,
} from './roomManager.js';

import {
  playCard,
  takePile,
  interceptTurn,
} from './gameLogic.js';

// ─────────────────────────── Config ──────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// Soporta múltiples orígenes: prod, preview de Vercel y localhost
// CLIENT_ORIGIN puede ser una URL exacta o un patrón separado por comas
// Ej: "https://4amigos.vercel.app,https://4amigos-git-main.vercel.app"
const rawOrigins = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:3000';

function buildCorsOrigin(raw: string): string | string[] | RegExp {
  const origins = raw.split(',').map(o => o.trim()).filter(Boolean);
  if (origins.length === 1) return origins[0]!;
  return origins;
}

const CORS_ORIGIN = buildCorsOrigin(rawOrigins);
const MAX_PLAYERS = 4;

// ─────────────────────────── HTTP + Express ───────────────────────────────────

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, ...getRoomStats(), timestamp: Date.now() });
});

const httpServer = http.createServer(app);

// ─────────────────────────── Socket.io ───────────────────────────────────────

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Timeouts generosos para conexiones con latencia alta (usuarios remotos)
  pingTimeout: 30000,
  pingInterval: 15000,
});

// ─────────────────────────── Turn Timer (server-side enforcement) ─────────────

const TURN_TIMEOUT_MS = 17_000;
const roomTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resetTurnTimer(roomId: string): void {
  const prev = roomTurnTimers.get(roomId);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    const room = getRoom(roomId);
    if (!room || room.gameState.phase !== 'playing') return;

    const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    console.log(`[Room ${roomId}] Tiempo agotado — auto-penalizando a ${currentPlayer.name}`);

    const result = takePile(room.gameState, currentPlayer.id);
    if (result.ok) {
      io.to(currentPlayer.id).emit('PLAY_RESULT', {
        success: true,
        code: 'took_pile',
        message: 'Tiempo agotado — recogiste el pozo',
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

/**
 * Emite el GameStateView personalizado a cada jugador de la sala.
 * Cada jugador recibe SÓLO su propia vista (con sus cartas reales).
 */
function emitRoomState(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;

  const views = buildRoomViews(room);
  for (const [playerId, view] of views.entries()) {
    io.to(playerId).emit('ROOM_STATE', { view });
  }
}


/** Emite el evento GAME_END a todos los jugadores de la sala con el resultado */
function emitGameEnd(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;

  const players = room.gameState.players;
  const ordered = room.gameState.finishOrder.map((id, idx) => {
    const p = players.find(pl => pl.id === id);
    return { id, name: p?.name ?? '?', rank: idx + 1 };
  });

  const winner = ordered[0];
  const loser = ordered[ordered.length - 1];

  io.to(roomId).emit('GAME_END', {
    finishOrder: ordered,
    winnerId: winner?.id ?? '',
    winnerName: winner?.name ?? '?',
    loserId: loser?.id ?? '',
    loserName: loser?.name ?? '?',
  });

  console.log(`[Room ${roomId}] Fin de partida — Ganador: ${winner?.name} | Shithead: ${loser?.name}`);
}

// ─────────────────────────── Validación de entrada ───────────────────────────

function isValidRoomId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Z0-9]{2,10}$/.test(id.trim());
}

function isValidPlayerName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 30;
}

function isValidCardIds(ids: unknown): ids is string[] {
  return Array.isArray(ids)
    && ids.length >= 1
    && ids.length <= 4
    && ids.every(id => typeof id === 'string' && id.length > 0);
}

// ─────────────────────────── Manejadores de socket ───────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket] Conexión: ${socket.id}`);

  // ── JOIN_ROOM ──────────────────────────────────────────────────────────────
  socket.on('JOIN_ROOM', (payload: JoinRoomPayload) => {
    const { roomId, playerName } = payload ?? {};

    if (!isValidRoomId(roomId)) {
      socket.emit('ERROR', { code: 'INVALID_ROOM_ID', message: 'ID de sala inválido (usa solo letras y números)' });
      return;
    }
    if (!isValidPlayerName(playerName)) {
      socket.emit('ERROR', { code: 'INVALID_NAME', message: 'Nombre inválido (1-30 caracteres)' });
      return;
    }

    const trimmedRoom = roomId.trim().toUpperCase();
    const result = joinRoom(trimmedRoom, socket.id, playerName.trim());

    if ('error' in result) {
      socket.emit('ERROR', { code: 'JOIN_FAILED', message: result.error });
      return;
    }

    const { room } = result;

    // Guardar datos del socket para uso en otros handlers
    socket.data.playerId = socket.id;
    socket.data.playerName = playerName.trim();
    socket.data.roomId = trimmedRoom;

    // Unirse al canal de la sala (Socket.io rooms)
    void socket.join(trimmedRoom);

    console.log(`[Room ${trimmedRoom}] "${playerName}" se unió (${room.gameState.players.length}/${MAX_PLAYERS})`);

    // Emitir estado actualizado a todos en la sala
    emitRoomState(trimmedRoom);

    // Auto-iniciar si la sala tiene el máximo de jugadores
    if (
      room.gameState.players.length >= MAX_PLAYERS
      && room.gameState.phase === 'lobby'
    ) {
      const startResult = startGame(trimmedRoom);
      if (startResult.ok) {
        const playerOrder = startResult.room.gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
        }));
        io.to(trimmedRoom).emit('GAME_START', { roomId: trimmedRoom, playerOrder });
        emitRoomState(trimmedRoom);
        resetTurnTimer(trimmedRoom);
        console.log(`[Room ${trimmedRoom}] Partida iniciada automáticamente (sala llena)`);
      }
    }
  });

  // ── READY (inicio manual con ≥2 jugadores) ─────────────────────────────────
  socket.on('READY', () => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      socket.emit('ERROR', { code: 'NOT_IN_ROOM', message: 'No estás en ninguna sala' });
      return;
    }

    const room = getRoom(roomId);
    if (!room) {
      socket.emit('ERROR', { code: 'ROOM_NOT_FOUND', message: 'Sala no encontrada' });
      return;
    }

    if (room.gameState.phase !== 'lobby') {
      socket.emit('ERROR', { code: 'ALREADY_STARTED', message: 'La partida ya inició' });
      return;
    }

    if (room.gameState.players.length < 2) {
      socket.emit('ERROR', {
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Se necesitan al menos 2 jugadores (ahora hay ${room.gameState.players.length})`,
      });
      return;
    }

    const startResult = startGame(roomId);
    if (!startResult.ok) {
      socket.emit('ERROR', { code: 'START_FAILED', message: startResult.error });
      return;
    }

    const playerOrder = startResult.room.gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
    }));

    io.to(roomId).emit('GAME_START', { roomId, playerOrder });
    emitRoomState(roomId);
    resetTurnTimer(roomId);
    console.log(`[Room ${roomId}] Partida iniciada manualmente`);
  });

  // ── PLAY_CARD ──────────────────────────────────────────────────────────────
  socket.on('PLAY_CARD', (payload: PlayCardPayload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const { cardIds } = payload ?? {};
    if (!isValidCardIds(cardIds)) {
      socket.emit('PLAY_RESULT', {
        success: false,
        code: 'invalid_card',
        message: 'Payload inválido: cardIds debe ser un array de 1-4 strings',
      });
      return;
    }

    const room = getRoom(roomId);
    if (!room) return;

    const result = playCard(room.gameState, socket.id, cardIds);

    if (!result.ok) {
      socket.emit('PLAY_RESULT', {
        success: false,
        code: result.code as 'invalid_card',
        message: result.message,
      });
      return;
    }

    socket.emit('PLAY_RESULT', {
      success: true,
      code: 'ok',
      message: result.burned ? '¡Pozo quemado! 🔥' : 'Carta jugada',
    });

    emitRoomState(roomId);

    if (result.gameOver || room.gameState.phase === 'finished') {
      cancelTurnTimer(roomId);
      emitGameEnd(roomId);
    } else {
      resetTurnTimer(roomId);
    }
  });

  // ── TAKE_PILE ──────────────────────────────────────────────────────────────
  socket.on('TAKE_PILE', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = getRoom(roomId);
    if (!room) return;

    const result = takePile(room.gameState, socket.id);

    if (!result.ok) {
      socket.emit('PLAY_RESULT', {
        success: false,
        code: result.code as 'invalid_card',
        message: result.message,
      });
      return;
    }

    socket.emit('PLAY_RESULT', {
      success: true,
      code: 'took_pile',
      message: 'Recogiste el pozo 💀',
      penaltyApplied: true,
    });

    emitRoomState(roomId);
  });

  // ── FLIP_BLIND ─────────────────────────────────────────────────────────────
  socket.on('FLIP_BLIND', (payload: FlipBlindPayload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const { cardId } = payload ?? {};
    if (typeof cardId !== 'string' || !cardId) {
      socket.emit('ERROR', { code: 'INVALID_PAYLOAD', message: 'cardId inválido' });
      return;
    }

    const room = getRoom(roomId);
    if (!room) return;

    // La lógica de ciega está dentro de playCard (detecta fase automáticamente)
    const result = playCard(room.gameState, socket.id, [cardId]);

    if (!result.ok) {
      socket.emit('PLAY_RESULT', {
        success: false,
        code: result.code as 'invalid_card',
        message: result.message,
      });
      return;
    }

    socket.emit('PLAY_RESULT', { success: true, code: 'ok', message: 'Carta ciega volteada' });
    emitRoomState(roomId);

    if (result.gameOver || room.gameState.phase === 'finished') {
      cancelTurnTimer(roomId);
      emitGameEnd(roomId);
    } else {
      resetTurnTimer(roomId);
    }
  });

  // ── INTERCEPT_TURN ─────────────────────────────────────────────────────────
  /**
   * MECÁNICA CORE: el servidor procesa el primer evento que llega.
   * La race condition es intencional — el más rápido gana.
   */
  socket.on('INTERCEPT_TURN', (payload: InterceptTurnPayload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const { cardIds } = payload ?? {};
    if (!isValidCardIds(cardIds)) {
      socket.emit('INTERCEPT_RESULT', {
        success: false,
        interceptorId: socket.id,
        interceptorName: socket.data.playerName ?? 'Jugador',
        message: 'Payload inválido',
        penaltyApplied: false,
      });
      return;
    }

    const room = getRoom(roomId);
    if (!room) return;

    const interceptorName = socket.data.playerName ?? 'Jugador';
    const result = interceptTurn(room.gameState, socket.id, cardIds);

    if (!result.ok) {
      io.to(roomId).emit('INTERCEPT_RESULT', {
        success: false,
        interceptorId: socket.id,
        interceptorName,
        penaltyApplied: result.penaltyApplied,
        message: result.message,
      });
      emitRoomState(roomId);
      return;
    }

    io.to(roomId).emit('INTERCEPT_RESULT', {
      success: true,
      interceptorId: socket.id,
      interceptorName,
      message: `⚡ ¡${interceptorName} robó el turno!`,
    });

    emitRoomState(roomId);
    resetTurnTimer(roomId);
    console.log(`[Room ${roomId}] Intercepcion exitosa por ${interceptorName}`);
  });

  // -- SEND_REACTION ────────────────────────────────────────────────────────
  socket.on('SEND_REACTION', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const emoji = typeof payload?.emoji === 'string'
      ? payload.emoji.slice(0, 8).trim()
      : null;
    if (!emoji) return;

    const room = getRoom(roomId);
    const player = room?.gameState.players.find(p => p.id === socket.id);
    const playerColor = player?.avatarColor ?? '#FF6A1A';

    io.to(roomId).emit('PLAYER_REACTION', {
      playerId: socket.id,
      playerName: socket.data.playerName ?? 'Jugador',
      playerColor,
      emoji,
    });
  });

    // ── RESTART_GAME ─────────────────────────────────────────────────────────────
  socket.on('RESTART_GAME', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const result = resetRoom(roomId);
    if (!result.ok) {
      socket.emit('ERROR', { code: 'restart_failed', message: result.error });
      return;
    }

    cancelTurnTimer(roomId);
    io.to(roomId).emit('GAME_RESTARTED');
    emitRoomState(roomId);
    console.log(`[Room ${roomId}] Partida reiniciada`);
  });

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Desconexión: ${socket.id} — motivo: ${reason}`);
    const { roomId } = handleDisconnect(socket.id);
    if (roomId) {
      emitRoomState(roomId);
    }
  });
});

// ─────────────────────────── Tareas periódicas ───────────────────────────────

// Limpiar salas expiradas cada 30 minutos
setInterval(purgeExpiredRooms, 30 * 60 * 1000);

// ─────────────────────────── Arranque ────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n[4 Amigos] — Servidor autoritario`);
  console.log(`    Puerto : ${PORT}`);
  console.log(`    Cliente: ${rawOrigins}`);
  console.log(`    Modo   : ${process.env['NODE_ENV'] ?? 'development'}\n`);
});

export { io, httpServer };
