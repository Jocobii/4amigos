// =============================================================================
// 4 Amigos — Tipos compartidos (espejo del servidor)
// Este archivo es identico a packages/server/src/types/game.ts
// NO importar desde el servidor — mantenerlo sincronizado manualmente.
// =============================================================================

export type Suit = 'oros' | 'copas' | 'espadas' | 'bastos';

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  readonly id: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

export interface CardBack {
  readonly id: string;
  readonly faceDown: true;
}

export type CardView = Card | CardBack;

export type PlayerStatus = 'waiting' | 'playing' | 'finished' | 'disconnected';

export type GamePhase = 'lobby' | 'dealing' | 'playing' | 'finished';

export type TurnConstraint = 'normal' | 'mirror' | 'blind';

export type ActivityKind =
  | 'play' | 'take_pile' | 'intercept' | 'intercept_fail'
  | 'burn' | 'flip_blind' | 'join' | 'leave' | 'win';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  actorId: string;
  actorName: string;
  actorColor: string;
  targetId?: string;
  targetName?: string;
  cardRanks?: string[];
  timestamp: number;
}

export interface InterceptState {
  isOpen: boolean;
  activePlayerId: string | null;
  openedAt: number | null;
}

export interface SelfView {
  readonly id: string;
  readonly name: string;
  readonly avatarColor: string;
  readonly seatIndex: number;
  readonly status: PlayerStatus;
  readonly isConnected: boolean;
  readonly penaltyCount: number;
  readonly hand: Card[];
  readonly tableUp: Card[];
  readonly tableDownCount: number;
  readonly tableDown: CardBack[];
}

export interface PlayerView {
  readonly id: string;
  readonly name: string;
  readonly avatarColor: string;
  readonly seatIndex: number;
  readonly status: PlayerStatus;
  readonly isConnected: boolean;
  readonly penaltyCount: number;
  readonly handCount: number;
  readonly tableUp: Card[];
  readonly tableDownCount: number;
  readonly tableDown: CardBack[];
}

export interface GameStateView {
  phase: GamePhase;
  self: SelfView | null;
  opponents: PlayerView[];
  discardTopCard: Card | null;
  discardPileCount: number;
  deckCount: number;
  currentPlayerId: string;
  turnConstraint: TurnConstraint;
  intercept: InterceptState;
  round: number;
  finishOrder: string[];
  lastActivity: ActivityEvent[];
  roomId: string;
  turnStartedAt: number;
}

// -- Payloads de Socket -------------------------------------------------------

export interface JoinRoomPayload { roomId: string; playerName: string; }
export interface PlayCardPayload { cardIds: string[]; }
export interface InterceptTurnPayload { cardIds: string[]; }
export interface FlipBlindPayload { cardId: string; }

export interface RoomStatePayload { view: GameStateView; }

export interface PlayResultPayload {
  success: boolean;
  code: 'ok' | 'invalid_card' | 'wrong_constraint' | 'not_your_turn' | 'card_not_found' | 'took_pile' | 'already_finished';
  message: string;
  penaltyApplied?: boolean;
}

export interface InterceptResultPayload {
  success: boolean;
  interceptorId: string;
  interceptorName: string;
  penaltyApplied?: boolean;
  message: string;
}

export interface GameStartPayload {
  roomId: string;
  playerOrder: Array<{ id: string; name: string; seatIndex: number }>;
}

export interface GameEndPayload {
  finishOrder: Array<{ id: string; name: string; rank: number }>;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
}

export interface ErrorPayload { code: string; message: string; }

export interface ClientToServerEvents {
  JOIN_ROOM: (payload: JoinRoomPayload) => void;
  READY: () => void;
  PLAY_CARD: (payload: PlayCardPayload) => void;
  TAKE_PILE: () => void;
  FLIP_BLIND: (payload: FlipBlindPayload) => void;
  INTERCEPT_TURN: (payload: InterceptTurnPayload) => void;
  RESTART_GAME: () => void;
}

export interface ServerToClientEvents {
  ROOM_STATE: (payload: RoomStatePayload) => void;
  PLAY_RESULT: (payload: PlayResultPayload) => void;
  INTERCEPT_RESULT: (payload: InterceptResultPayload) => void;
  GAME_START: (payload: GameStartPayload) => void;
  GAME_END: (payload: GameEndPayload) => void;
  GAME_RESTARTED: () => void;
  ERROR: (payload: ErrorPayload) => void;
}
