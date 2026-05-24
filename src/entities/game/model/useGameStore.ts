// =============================================================================
// 4 Amigos — Zustand Store del juego
// Estado global del cliente. Solo almacena vistas sanitizadas del servidor.
// =============================================================================

'use client';

import { create } from 'zustand';
import type {
  GameStateView,
  PlayResultPayload,
  InterceptResultPayload,
  GameEndPayload,
} from '@/src/shared/types/game';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

interface GameStore {
  // ── Conexión ──────────────────────────────────────────────────────────────
  connectionStatus: ConnectionStatus;
  socketId: string | null;

  // ── Sala / Partida ────────────────────────────────────────────────────────
  roomId: string | null;
  playerName: string | null;
  gameView: GameStateView | null;
  gameEnd: GameEndPayload | null;

  // ── UI local ─────────────────────────────────────────────────────────────
  selectedCardIds: string[];
  notifications: Notification[];
  interceptFlash: boolean; // Parpadeo cuando la ventana de intercepción se abre

  // ── Actions ───────────────────────────────────────────────────────────────
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSocketId: (id: string | null) => void;
  setRoom: (roomId: string, playerName: string) => void;
  setGameView: (view: GameStateView) => void;
  setGameEnd: (payload: GameEndPayload) => void;
  handlePlayResult: (result: PlayResultPayload) => void;
  handleInterceptResult: (result: InterceptResultPayload) => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  addNotification: (type: Notification['type'], message: string) => void;
  dismissNotification: (id: string) => void;
  setInterceptFlash: (v: boolean) => void;
  reset: () => void;
}

let notifCounter = 0;

export const useGameStore = create<GameStore>((set, get) => ({
  // ── Estado inicial ────────────────────────────────────────────────────────
  connectionStatus: 'disconnected',
  socketId: null,
  roomId: null,
  playerName: null,
  gameView: null,
  gameEnd: null,
  selectedCardIds: [],
  notifications: [],
  interceptFlash: false,

  // ── Actions ───────────────────────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSocketId: (id) => set({ socketId: id }),

  setRoom: (roomId, playerName) => set({ roomId, playerName }),

  setGameView: (view) => {
    const prev = get().gameView;
    const wasInterceptOpen = prev?.intercept.isOpen ?? false;
    const isInterceptOpen = view.intercept.isOpen;

    set({
      gameView: view,
      // Si la ventana de intercepción se abrió, activar flash
      interceptFlash: !wasInterceptOpen && isInterceptOpen,
    });

    // Apagar flash tras 800ms
    if (!wasInterceptOpen && isInterceptOpen) {
      setTimeout(() => set({ interceptFlash: false }), 800);
    }
  },

  setGameEnd: (payload) => set({ gameEnd: payload }),

  handlePlayResult: (result) => {
    if (!result.success) {
      get().addNotification('error', result.message);
    } else if (result.penaltyApplied) {
      get().addNotification('warning', result.message);
    }
    // Limpiar selección al jugar
    set({ selectedCardIds: [] });
  },

  handleInterceptResult: (result) => {
    const type = result.success ? 'success' : 'error';
    get().addNotification(type, result.message);
  },

  toggleCardSelection: (cardId) => {
    const { selectedCardIds, gameView } = get();
    if (!gameView) return;

    // Solo se pueden seleccionar cartas del mismo rango
    const isSelected = selectedCardIds.includes(cardId);

    if (isSelected) {
      set({ selectedCardIds: selectedCardIds.filter(id => id !== cardId) });
      return;
    }

    // Verificar rango: si ya hay selección, el nuevo rango debe coincidir
    if (selectedCardIds.length > 0) {
      const hand = gameView.self?.hand ?? [];
      const tableUp = gameView.self?.tableUp ?? [];
      const allCards = [...hand, ...tableUp];

      const firstSelected = allCards.find(c => c.id === selectedCardIds[0]);
      const newCard = allCards.find(c => c.id === cardId);

      if (firstSelected && newCard && firstSelected.rank !== newCard.rank) {
        // Rango diferente → reemplazar selección
        set({ selectedCardIds: [cardId] });
        return;
      }
    }

    set({ selectedCardIds: [...selectedCardIds, cardId] });
  },

  clearSelection: () => set({ selectedCardIds: [] }),

  addNotification: (type, message) => {
    const id = `notif_${++notifCounter}`;
    const notif: Notification = { id, type, message, timestamp: Date.now() };
    set(s => ({ notifications: [...s.notifications.slice(-4), notif] }));
    setTimeout(() => get().dismissNotification(id), 4000);
  },

  dismissNotification: (id) =>
    set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),

  setInterceptFlash: (v) => set({ interceptFlash: v }),

  reset: () => set({
    roomId: null,
    playerName: null,
    gameView: null,
    gameEnd: null,
    selectedCardIds: [],
    notifications: [],
    interceptFlash: false,
  }),
}));
