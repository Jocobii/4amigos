'use client';

import { useGameStore } from '@/src/entities/game';
import { LobbyForm } from '@/src/features/join-room/ui/LobbyForm';
import { GameBoard } from '@/src/widgets/game-board';

export default function Home() {
  const gameView = useGameStore(s => s.gameView);

  // Si ya hay estado de juego, mostrar el tablero
  if (gameView) {
    return <GameBoard />;
  }

  // De lo contrario, mostrar el lobby
  return <LobbyForm />;
}
