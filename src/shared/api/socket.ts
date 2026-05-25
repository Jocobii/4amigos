// =============================================================================
// 4 Amigos -- WebSocket Client Singleton
// Wrapper sobre WebSocket nativo con la misma API que socket.io
// (.emit / .on / .off / .connected / connect / disconnect).
//
// Protocolo JSON (igual que el servidor ws):
//   C -> S: { "event": "PLAY_CARD",  "payload": { ... } }
//   S -> C: { "event": "ROOM_STATE", "payload": { ... } }
// =============================================================================

type Listener = (...args: unknown[]) => void;

class WsSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private listeners: Map<string, Set<Listener>> = new Map();
  private _connected = false;
  private sendQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): this {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return this;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;
      for (const msg of this.sendQueue) {
        this.ws!.send(msg);
      }
      this.sendQueue = [];
      this._trigger('connect');
    };

    this.ws.onclose = (ev) => {
      this._connected = false;
      this._trigger('disconnect', ev.reason ?? 'transport close');
    };

    this.ws.onerror = () => {
      this._trigger('connect_error', new Error('WebSocket error'));
    };

    this.ws.onmessage = (ev) => {
      let parsed: { event: string; payload?: unknown };
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        console.warn('[socket] Mensaje no-JSON ignorado:', ev.data);
        return;
      }
      const { event, payload } = parsed;
      if (typeof event !== 'string') return;
      this._trigger(event, payload ?? undefined);
    };

    return this;
  }

  disconnect(): this {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    return this;
  }

  emit(event: string, payload?: unknown): this {
    const msg = JSON.stringify({ event, payload: payload ?? null });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.sendQueue.push(msg);
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }
    return this;
  }

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener?: Listener): this {
    if (!listener) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(listener);
    }
    return this;
  }

  private _trigger(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(...args);
      } catch (e) {
        console.error('[socket] Error en listener "' + event + '":', e);
      }
    }
  }
}

const RAW_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'ws://localhost:3001';

const SERVER_URL = RAW_URL
  .replace(/^http:\/\//, 'ws://')
  .replace(/^https:\/\//, 'wss://');

let socket: WsSocket | null = null;

export function getSocket(): WsSocket {
  if (!socket) {
    socket = new WsSocket(SERVER_URL);
  }
  return socket;
}

export function connectSocket(): WsSocket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export type AppSocket = WsSocket;
