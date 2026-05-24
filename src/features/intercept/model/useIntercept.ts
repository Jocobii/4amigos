'use client';

import { useCallback } from 'react';
import { getSocket } from '@/src/shared/api/socket';
import { useGameStore } from '@/src/entities/game';

export function useIntercept() {
  const gameView = useGameStore(s => s.gameView);
  const socketId = useGameStore(s => s.socketId);
  const interceptFlash = useGameStore(s => s.interceptFlash);

  const isInterceptOpen = gameView?.intercept.isOpen ?? false;
  const isMyTurn = gameView?.currentPlayerId === socketId;

  // ¿El jugador tiene un 5 en la mano?
  const hasFive = (gameView?.self?.hand ?? []).some(c => c.rank === '5');

  // Puede interceptar si: ventana abierta + no es su turno + tiene un 5
  const canIntercept = isInterceptOpen && !isMyTurn && hasFive;

  const interceptTurn = useCallback(() => {
    const hand = gameView?.self?.hand ?? [];
    const fiveCard = hand.find(c => c.rank === '5');
    if (!fiveCard) return;

    const socket = getSocket();
    socket.emit('INTERCEPT_TURN', { cardIds: [fiveCard.id] });
  }, [gameView]);

  return {
    canIntercept,
    isInterceptOpen,
    interceptFlash,
    interceptTurn,
    hasFive,
  };
}
