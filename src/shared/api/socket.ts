// =============================================================================
// 4 Amigos — Socket.io Client Singleton
// Un solo socket compartido por toda la app. Se inicializa lazy.
// =============================================================================

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/src/shared/types/game';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

let socket: AppSocket | null = null;

/** Devuelve (o crea) el singleton del socket */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/** Conecta el socket si no está ya conectado */
export function connectSocket(): AppSocket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

/** Desconecta y destruye el singleton (útil en tests o al cerrar sesión) */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
