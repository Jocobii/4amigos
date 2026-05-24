'use client';

import { useCallback } from 'react';
import { getSocket } from '@/src/shared/api/socket';
import { useGameStore } from '@/src/entities/game';

export function usePlayCard() {
  const { selectedCardIds, clearSelection, gameView, socketId } = useGameStore();

  const isMyTurn = gameView?.currentPlayerId === socketId;

  const playSelected = useCallback(() => {
    if (selectedCardIds.length === 0) return;
    const socket = getSocket();
    socket.emit('PLAY_CARD', { cardIds: selectedCardIds });
    clearSelection();
  }, [selectedCardIds, clearSelection]);

  const takePile = useCallback(() => {
    const socket = getSocket();
    socket.emit('TAKE_PILE');
  }, []);

  const flipBlind = useCallback((cardId: string) => {
    const socket = getSocket();
    socket.emit('FLIP_BLIND', { cardId });
  }, []);

  const startGame = useCallback(() => {
    const socket = getSocket();
    socket.emit('READY');
  }, []);

  return { playSelected, takePile, flipBlind, startGame, isMyTurn, selectedCardIds };
}
