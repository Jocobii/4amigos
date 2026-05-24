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
  // -- Conexion ---------------------------------------------------------------
  connectionStatus: ConnectionStatus;
  socketId: string | null;

  // -- Sala / Partida ---------------------------------------------------------
  roomId: string | null;
  playerName: string | null;
  gameView: GameStateView | null;
  gameEnd: GameEndPayload | null;

  // -- UI local ---------------------------------------------------------------
  selectedCardIds: string[];
  notifications: Notification[];
  interceptFlash: boolean;
  burnActive: boolean;
  interceptActive: boolean;
  lastSeenActivityId: string | null;

  // -- Actions ----------------------------------------------------------------
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
  // -- Estado inicial ---------------------------------------------------------
  connectionStatus: 'disconnected',
  socketId: null,
  roomId: null,
  playerName: null,
  gameView: null,
  gameEnd: null,
  selectedCardIds: [],
  notifications: [],
  interceptFlash: false,
  burnActive: false,
  interceptActive: false,
  lastSeenActivityId: null,

  // -- Actions ----------------------------------------------------------------
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSocketId: (id) => set({ socketId: id }),

  setRoom: (roomId, playerName) => set({ roomId, playerName }),

  setGameView: (view) => {
    const prev = get().gameView;
    const wasInterceptOpen = prev?.intercept.isOpen ?? false;
    const isInterceptOpen = view.intercept.isOpen;

    const lastSeen = get().lastSeenActivityId;
    const latestActivity = view.lastActivity[view.lastActivity.length - 1];
    const isNewActivity = latestActivity && latestActivity.id !== lastSeen;

    const hasBurn = isNewActivity && latestActivity?.kind === 'burn';
    const hasIntercept = isNewActivity && latestActivity?.kind === 'intercept';

    set({
      gameView: view,
      interceptFlash: !wasInterceptOpen && isInterceptOpen,
      lastSeenActivityId: latestActivity?.id ?? lastSeen,
      ...(hasBurn && { burnActive: true }),
      ...(hasIntercept && { interceptActive: true }),
    });

    if (!wasInterceptOpen && isInterceptOpen) {
      setTimeout(() => set({ interceptFlash: false }), 800);
    }
    if (hasBurn) {
      setTimeout(() => set({ burnActive: false }), 1800);
    }
    if (hasIntercept) {
      setTimeout(() => set({ interceptActive: false }), 1200);
    }
  },

  setGameEnd: (payload) => set({ gameEnd: payload }),

  handlePlayResult: (result) => {
    if (!result.success) {
      get().addNotification('error', result.message);
    } else if (result.penaltyApplied) {
      get().addNotification('warning', result.message);
    }
    set({ selectedCardIds: [] });
  },

  handleInterceptResult: (result) => {
    const type = result.success ? 'success' : 'error';
    get().addNotification(type, result.message);
  },

  toggleCardSelection: (cardId) => {
    const { selectedCardIds, gameView } = get();
    if (!gameView) return;

    const isSelected = selectedCardIds.includes(cardId);

    if (isSelected) {
      set({ selectedCardIds: selectedCardIds.filter(id => id !== cardId) });
      return;
    }

    if (selectedCardIds.length > 0) {
      const hand = gameView.self?.hand ?? [];
      const tableUp = gameView.self?.tableUp ?? [];
      const allCards = [...hand, ...tableUp];

      const firstSelected = allCards.find(c => c.id === selectedCardIds[0]);
      const newCard = allCards.find(c => c.id === cardId);

      if (firstSelected && newCard && firstSelected.rank !== newCard.rank) {
        set({ selectedCardIds: [cardId] });
        return;
      }
    }

    set({ selectedCardIds: [...selectedCardIds, cardId] });
  },

  clearSelection: () => set({ selectedCardIds: [] }),

  addNotification: (type, message) => {
    const id = 'notif_' + (++notifCounter);
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
    burnActive: false,
    interceptActive: false,
    lastSeenActivityId: null,
  }),
}));
