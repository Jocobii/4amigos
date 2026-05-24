'use client';

import { useCallback, useState } from 'react';
import { connectSocket } from '@/src/shared/api/socket';
import { useGameStore } from '@/src/entities/game';

export function useJoinRoom() {
  const [isLoading, setIsLoading] = useState(false);
  const { setRoom, setConnectionStatus, setSocketId, setGameView, setGameEnd,
          handlePlayResult, handleInterceptResult, addNotification, reset } = useGameStore();

  const joinRoom = useCallback((roomId: string, playerName: string) => {
    setIsLoading(true);
    setConnectionStatus('connecting');

    const socket = connectSocket();

    socket.off('connect');
    socket.off('disconnect');
    socket.off('ROOM_STATE');
    socket.off('GAME_START');
    socket.off('GAME_END');
    socket.off('GAME_RESTARTED');
    socket.off('PLAY_RESULT');
    socket.off('INTERCEPT_RESULT');
    socket.off('ERROR');

    socket.on('connect', () => {
      setConnectionStatus('connected');
      setSocketId(socket.id ?? null);
      socket.emit('JOIN_ROOM', { roomId: roomId.toUpperCase().trim(), playerName: playerName.trim() });
      setIsLoading(false);
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      addNotification('warning', 'Conexion perdida. Reconectando...');
    });

    socket.on('ROOM_STATE', ({ view }) => {
      setGameView(view);
      setRoom(view.roomId, playerName.trim());
    });

    socket.on('GAME_START', ({ roomId: rid }) => {
      addNotification('info', 'La partida en la sala ' + rid + ' ha comenzado!');
    });

    socket.on('GAME_END', (payload) => {
      setGameEnd(payload);
    });

    socket.on('GAME_RESTARTED', () => {
      reset();
      addNotification('info', 'Nueva partida! Volviendo al lobby...');
      socket.emit('JOIN_ROOM', { roomId: roomId.toUpperCase().trim(), playerName: playerName.trim() });
    });

    socket.on('PLAY_RESULT', (result) => {
      handlePlayResult(result);
    });

    socket.on('INTERCEPT_RESULT', (result) => {
      handleInterceptResult(result);
    });

    socket.on('ERROR', ({ message }) => {
      addNotification('error', message);
      setIsLoading(false);
    });

    if (socket.connected) {
      setConnectionStatus('connected');
      setSocketId(socket.id ?? null);
      socket.emit('JOIN_ROOM', { roomId: roomId.toUpperCase().trim(), playerName: playerName.trim() });
      setIsLoading(false);
    }
  }, [setRoom, setConnectionStatus, setSocketId, setGameView, setGameEnd,
      handlePlayResult, handleInterceptResult, addNotification, reset]);

  return { joinRoom, isLoading };
}
