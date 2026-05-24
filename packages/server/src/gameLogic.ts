// =============================================================================
// 4 Amigos — Lógica Central del Juego (Reducer Puro)
// Sin efectos secundarios. Recibe estado + acción → devuelve nuevo estado.
// El servidor es el único que importa este módulo.
// =============================================================================

import { nanoid } from 'nanoid';
import type {
  Card, CardBack, Player, GameState, Rank, Suit,
  DiscardPile, InterceptState, TurnConstraint, ActivityEvent, ActivityKind,
} from './types/game.js';

// ─────────────────────────── Valores numéricos de rango ──────────────────────

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos'];
const RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const AVATAR_COLORS = ['#FF6A1A', '#E8FF3D', '#9DE5FF', '#FF2244'];

// ─────────────────────────── Barajar ─────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Crea dos barajas inglesas (104 cartas) con IDs únicos */
export function createDoubleDeck(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${deck}_${suit}_${rank}_${nanoid(4)}`, rank, suit });
      }
    }
  }
  return shuffle(cards);
}

// ─────────────────────────── Inicializar partida ─────────────────────────────

export function createInitialGameState(
  players: Array<{ id: string; name: string }>,
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new Error('Se requieren entre 2 y 4 jugadores');
  }

  const deck = createDoubleDeck();
  let deckIdx = 0;

  const take = (n: number): Card[] => {
    const cards = deck.slice(deckIdx, deckIdx + n);
    deckIdx += n;
    return cards;
  };

  const gamePlayers: Player[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatarColor: AVATAR_COLORS[i] ?? '#FF6A1A',
    hand: take(4),
    tableUp: take(4),
    tableDown: take(4),
    status: 'playing',
    isConnected: true,
    seatIndex: i,
    penaltyCount: 0,
  }));

  const remainingDeck = deck.slice(deckIdx);

  return {
    phase: 'playing',
    players: gamePlayers,
    deck: remainingDeck,
    discardPile: { cards: [], topCard: null },
    currentPlayerIndex: 0,
    turnConstraint: 'normal',
    intercept: { isOpen: false, activePlayerId: null, openedAt: null },
    round: 1,
    finishOrder: [],
    lastActivity: [],
    turnStartedAt: Date.now(),
  };
}

// ─────────────────────────── Utilidades de acceso ────────────────────────────

export function getPlayer(state: GameState, playerId: string): Player {
  const p = state.players.find(p => p.id === playerId);
  if (!p) throw new Error(`Jugador no encontrado: ${playerId}`);
  return p;
}

export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

function addActivity(
  state: GameState,
  kind: ActivityKind,
  actor: Player,
  extra?: Partial<ActivityEvent>,
): void {
  const event: ActivityEvent = {
    id: nanoid(8),
    kind,
    actorId: actor.id,
    actorName: actor.name,
    actorColor: actor.avatarColor,
    timestamp: Date.now(),
    ...extra,
  };
  state.lastActivity = [...state.lastActivity.slice(-19), event];
}

// ─────────────────────────── Validación de cartas ────────────────────────────

/** ¿Puede una carta jugarse sobre el tope actual? */
export function canPlayOnTop(card: Card, topCard: Card | null, constraint: TurnConstraint): boolean {
  // Sin carta en el pozo: cualquier carta es válida
  if (!topCard) return true;

  const val = RANK_VALUES[card.rank];
  const topVal = RANK_VALUES[topCard.rank];

  // 2 y 10 siempre se pueden jugar
  if (card.rank === '2' || card.rank === '10') return true;

  if (constraint === 'mirror') {
    // Después de un 7: hay que jugar ≤ 7 (o 2, que ya está cubierto arriba)
    return val <= 7;
  }

  // Flujo normal: carta ≥ tope
  return val >= topVal;
}

/** ¿El pozo debe quemarse? (10 jugado, o 4 del mismo rango al tope) */
function shouldBurnPile(discardPile: DiscardPile, playedCards: Card[]): boolean {
  // Si se jugó un 10
  if (playedCards.some(c => c.rank === '10')) return true;

  // Si se forman 4 consecutivas del mismo rango en el tope
  const pile = discardPile.cards;
  if (pile.length >= 4) {
    const top4 = pile.slice(-4);
    const allSameRank = top4.every(c => c.rank === top4[0]!.rank);
    if (allSameRank) return true;
  }

  return false;
}

// ─────────────────────────── Avanzar turno ───────────────────────────────────

function advanceTurn(state: GameState, fromPlayerIndex: number): void {
  const total = state.players.filter(p => p.status !== 'finished').length;
  if (total === 0) return;

  let next = (fromPlayerIndex + 1) % state.players.length;
  let tries = 0;
  while (state.players[next]!.status === 'finished' && tries < state.players.length) {
    next = (next + 1) % state.players.length;
    tries++;
  }
  state.currentPlayerIndex = next;
  state.turnConstraint = 'normal';
  state.turnStartedAt = Date.now();
}

/** Rellena la mano del jugador con cartas del mazo hasta 4 */
function refillHand(player: Player, deck: Card[]): void {
  while (player.hand.length < 4 && deck.length > 0) {
    player.hand.push(deck.shift()!);
  }
}

/** Verifica si un jugador ha terminado (sin cartas) */
function checkFinished(player: Player, state: GameState): boolean {
  const done = player.hand.length === 0
    && player.tableUp.length === 0
    && player.tableDown.length === 0;

  if (done && player.status === 'playing') {
    player.status = 'finished';
    state.finishOrder.push(player.id);

    // El primer jugador en terminar GANA — el juego para inmediatamente.
    state.phase = 'finished';
    const remaining = state.players.filter(p => p.status === 'playing');
    for (const p of remaining) {
      p.status = 'finished';
      state.finishOrder.push(p.id);
    }
  }

  return done;
}

/** Cierra la ventana de intercepción */
function closeInterceptWindow(state: GameState): void {
  state.intercept = { isOpen: false, activePlayerId: null, openedAt: null };
}

/** Abre ventana de intercepción cuando hay un 5 en el tope del pozo */
function maybeOpenInterceptWindow(state: GameState): void {
  const top = state.discardPile.topCard;
  if (top?.rank === '5') {
    state.intercept = {
      isOpen: true,
      activePlayerId: getCurrentPlayer(state).id,
      openedAt: Date.now(),
    };
  } else {
    closeInterceptWindow(state);
  }
}

// ─────────────────────────── Acción: PLAY CARD ───────────────────────────────

export type PlayCardResult =
  | { ok: true; burned: boolean; playerFinished: boolean; gameOver: boolean }
  | { ok: false; code: string; message: string };

/**
 * Intenta jugar una o más cartas del jugador activo.
 * Muta el estado de forma segura (usando deep-copy internamente si se necesita).
 */
export function playCard(
  state: GameState,
  playerId: string,
  cardIds: string[],
): PlayCardResult {
  // 1. Validaciones de contexto
  if (state.phase !== 'playing') {
    return { ok: false, code: 'wrong_phase', message: 'La partida no está en curso' };
  }

  const currentPlayer = getCurrentPlayer(state);
  if (currentPlayer.id !== playerId) {
    return { ok: false, code: 'not_your_turn', message: 'No es tu turno' };
  }

  if (cardIds.length === 0) {
    return { ok: false, code: 'no_cards', message: 'Debes seleccionar al menos una carta' };
  }

  const player = getPlayer(state, playerId);

  // 2. Determinar desde qué zona se juega (hand > tableUp > tableDown)
  // Lógica de fase: mano primero, si está vacía tableUp, si está vacía tableDown
  const isPlayingFromHand = player.hand.length > 0;
  const isPlayingFromTableUp = !isPlayingFromHand && player.tableUp.length > 0;
  const isPlayingFromTableDown = !isPlayingFromHand && !isPlayingFromTableUp && player.tableDown.length > 0;

  if (state.turnConstraint === 'blind' || isPlayingFromTableDown) {
    // Fase de ciega: solo se puede voltear una carta
    return flipBlindCard(state, playerId, cardIds[0]!);
  }

  // 3. Buscar las cartas en la zona correcta
  const sourcePool: Card[] = isPlayingFromHand ? player.hand : player.tableUp;
  const playedCards: Card[] = [];

  for (const cid of cardIds) {
    const idx = sourcePool.findIndex(c => c.id === cid);
    if (idx === -1) {
      return { ok: false, code: 'card_not_found', message: `Carta ${cid} no encontrada en la zona de juego` };
    }
    playedCards.push(sourcePool[idx]!);
  }

  // 4. Todas las cartas deben tener el mismo rango (jugada múltiple)
  const firstRank = playedCards[0]!.rank;
  if (!playedCards.every(c => c.rank === firstRank)) {
    return { ok: false, code: 'mixed_ranks', message: 'Sólo puedes jugar varias cartas del mismo rango' };
  }

  // 5. Validar si la carta puede jugarse sobre el tope del pozo
  const representativeCard = playedCards[0]!;
  if (!canPlayOnTop(representativeCard, state.discardPile.topCard, state.turnConstraint)) {
    return { ok: false, code: 'invalid_card', message: `No puedes jugar ${firstRank} sobre ${state.discardPile.topCard?.rank ?? 'vacío'}` };
  }

  // 6. Aplicar jugada: sacar las cartas de la zona origen
  for (const card of playedCards) {
    const idx = sourcePool.findIndex(c => c.id === card.id);
    if (idx !== -1) sourcePool.splice(idx, 1);
  }

  // 7. Añadir al pozo
  state.discardPile.cards.push(...playedCards);
  state.discardPile.topCard = playedCards[playedCards.length - 1]!;

  // 8. Registrar actividad
  closeInterceptWindow(state);
  addActivity(state, 'play', player, { cardRanks: playedCards.map(c => c.rank) });

  // 9. ¿Quemar el pozo?
  let burned = false;
  if (shouldBurnPile(state.discardPile, playedCards)) {
    state.discardPile = { cards: [], topCard: null };
    burned = true;
    addActivity(state, 'burn', player);
  }

  // 10. Manejar cartas especiales
  if (!burned) {
    if (firstRank === '7') {
      // El SIGUIENTE jugador debe jugar ≤ 7
      state.turnConstraint = 'mirror';
    } else {
      state.turnConstraint = 'normal';
    }
  }

  // 11. Rellenar mano del mazo
  refillHand(player, state.deck);

  // 12. Verificar si el jugador terminó
  const playerFinished = checkFinished(player, state);

  // 13. Si el pozo se quemó → el mismo jugador tira de nuevo
  //     Si se jugó 10 → idem
  //     En cualquier otro caso → siguiente turno
  if (!burned && firstRank !== '10') {
    advanceTurn(state, state.currentPlayerIndex);
  }

  // 14. Abrir ventana de intercepción si el tope es un 5
  if (!burned) {
    maybeOpenInterceptWindow(state);
  }

  const gameOver = (state.phase as string) === 'finished';
  return {
    ok: true,
    burned,
    playerFinished,
    gameOver,
  };
}

// ─────────────────────────── Acción: TAKE PILE (castigo voluntario) ──────────

export type TakePileResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function takePile(state: GameState, playerId: string): TakePileResult {
  if (state.phase !== 'playing') {
    return { ok: false, code: 'wrong_phase', message: 'La partida no está en curso' };
  }

  const currentPlayer = getCurrentPlayer(state);
  if (currentPlayer.id !== playerId) {
    return { ok: false, code: 'not_your_turn', message: 'No es tu turno' };
  }

  const player = getPlayer(state, playerId);

  // Mover el pozo completo a la mano del jugador
  player.hand.push(...state.discardPile.cards);
  player.penaltyCount++;
  state.discardPile = { cards: [], topCard: null };

  addActivity(state, 'take_pile', player);
  closeInterceptWindow(state);
  advanceTurn(state, state.currentPlayerIndex);

  return { ok: true };
}

// ─────────────────────────── Acción: FLIP BLIND ──────────────────────────────

function flipBlindCard(
  state: GameState,
  playerId: string,
  cardId: string,
): PlayCardResult {
  const player = getPlayer(state, playerId);

  // Buscar la ciega por su placeholder-id
  const blindIdx = player.tableDown.findIndex(c => c.id === cardId);
  if (blindIdx === -1) {
    return { ok: false, code: 'card_not_found', message: 'Carta ciega no encontrada' };
  }

  const blindCard = player.tableDown[blindIdx]!;

  // Intentar jugar la carta volteada
  if (canPlayOnTop(blindCard, state.discardPile.topCard, state.turnConstraint)) {
    // Sirve: se juega
    player.tableDown.splice(blindIdx, 1);
    state.discardPile.cards.push(blindCard);
    state.discardPile.topCard = blindCard;

    addActivity(state, 'flip_blind', player, { cardRanks: [blindCard.rank] });

    const burned = shouldBurnPile(state.discardPile, [blindCard]);
    if (burned) {
      state.discardPile = { cards: [], topCard: null };
      addActivity(state, 'burn', player);
    }

    if (blindCard.rank === '7' && !burned) {
      state.turnConstraint = 'mirror';
    } else {
      state.turnConstraint = 'normal';
    }

    const playerFinished = checkFinished(player, state);
    if (!burned && blindCard.rank !== '10') {
      advanceTurn(state, state.currentPlayerIndex);
    }
    if (!burned) maybeOpenInterceptWindow(state);

    return { ok: true, burned, playerFinished, gameOver: state.phase === 'finished' };
  } else {
    // No sirve: jugador recoge el pozo + la carta volteada
    player.hand.push(...state.discardPile.cards, blindCard);
    player.tableDown.splice(blindIdx, 1);
    player.penaltyCount++;
    state.discardPile = { cards: [], topCard: null };

    addActivity(state, 'take_pile', player);
    closeInterceptWindow(state);
    advanceTurn(state, state.currentPlayerIndex);

    return { ok: true, burned: false, playerFinished: false, gameOver: false };
  }
}

// ─────────────────────────── Acción: INTERCEPT TURN ──────────────────────────

export type InterceptResult =
  | { ok: true; burned: boolean; newCurrentPlayerId: string }
  | { ok: false; code: string; message: string; penaltyApplied: boolean };

/**
 * Cualquier jugador que NO es el jugador activo puede intentar interceptar
 * si hay un 5 en el tope del pozo y el jugador tiene un 5 en su mano.
 *
 * Reglas:
 * - El servidor procesa el PRIMER evento que llega (race condition deliberada).
 * - Si la intercepción es válida: el interceptor juega el 5 y se convierte en jugador activo.
 * - Si el interceptor no tiene un 5 o la ventana ya se cerró: recibe el pozo como penalización.
 */
export function interceptTurn(
  state: GameState,
  interceptorId: string,
  cardIds: string[],
): InterceptResult {
  if (state.phase !== 'playing') {
    return { ok: false, code: 'wrong_phase', message: 'La partida no está en curso', penaltyApplied: false };
  }

  const currentPlayer = getCurrentPlayer(state);

  // No puedes interceptar tu propio turno
  if (currentPlayer.id === interceptorId) {
    return { ok: false, code: 'self_intercept', message: 'No puedes interceptar tu propio turno', penaltyApplied: false };
  }

  const interceptor = getPlayer(state, interceptorId);

  // La ventana de intercepción debe estar abierta
  if (!state.intercept.isOpen) {
    // Penalización: el interceptor recoge el pozo
    interceptor.hand.push(...state.discardPile.cards);
    interceptor.penaltyCount++;
    state.discardPile = { cards: [], topCard: null };
    addActivity(state, 'intercept_fail', interceptor);
    closeInterceptWindow(state);
    return {
      ok: false,
      code: 'window_closed',
      message: 'La ventana de intercepción está cerrada',
      penaltyApplied: true,
    };
  }

  // Verificar que el tope actual es un 5
  if (state.discardPile.topCard?.rank !== '5') {
    // Penalización
    interceptor.hand.push(...state.discardPile.cards);
    interceptor.penaltyCount++;
    state.discardPile = { cards: [], topCard: null };
    addActivity(state, 'intercept_fail', interceptor);
    closeInterceptWindow(state);
    return {
      ok: false,
      code: 'top_not_5',
      message: 'El tope del pozo no es un 5',
      penaltyApplied: true,
    };
  }

  // El interceptor DEBE proveer exactamente un 5
  if (cardIds.length !== 1) {
    return {
      ok: false,
      code: 'invalid_intercept_count',
      message: 'La intercepción requiere exactamente una carta (un 5)',
      penaltyApplied: false,
    };
  }

  const cardId = cardIds[0]!;
  const cardIdx = interceptor.hand.findIndex(c => c.id === cardId);

  if (cardIdx === -1) {
    // Carta no encontrada en la mano → penalización
    interceptor.hand.push(...state.discardPile.cards);
    interceptor.penaltyCount++;
    state.discardPile = { cards: [], topCard: null };
    addActivity(state, 'intercept_fail', interceptor);
    closeInterceptWindow(state);
    return {
      ok: false,
      code: 'card_not_in_hand',
      message: 'No tienes esa carta en la mano',
      penaltyApplied: true,
    };
  }

  const card = interceptor.hand[cardIdx]!;

  // La carta DEBE ser un 5
  if (card.rank !== '5') {
    // Penalización: recoge el pozo
    interceptor.hand.push(...state.discardPile.cards);
    interceptor.penaltyCount++;
    state.discardPile = { cards: [], topCard: null };
    addActivity(state, 'intercept_fail', interceptor);
    closeInterceptWindow(state);
    return {
      ok: false,
      code: 'not_a_five',
      message: 'La intercepción solo es válida con un 5',
      penaltyApplied: true,
    };
  }

  // ✅ Intercepción válida: el interceptor roba el turno
  closeInterceptWindow(state);

  // Sacar el 5 de la mano y ponerlo en el pozo
  interceptor.hand.splice(cardIdx, 1);
  state.discardPile.cards.push(card);
  state.discardPile.topCard = card;

  addActivity(state, 'intercept', interceptor, {
    targetId: currentPlayer.id,
    targetName: currentPlayer.name,
    cardRanks: ['5'],
  });

  // El interceptor se convierte en el jugador activo
  const interceptorIndex = state.players.findIndex(p => p.id === interceptorId);
  state.currentPlayerIndex = interceptorIndex;
  state.turnConstraint = 'normal';

  // Rellenar mano del interceptor
  refillHand(interceptor, state.deck);

  // ¿El pozo se quema? (4x5 en el tope)
  const burned = shouldBurnPile(state.discardPile, [card]);
  if (burned) {
    state.discardPile = { cards: [], topCard: null };
    addActivity(state, 'burn', interceptor);
  } else {
    // El 5 en el tope: abrir nueva ventana de intercepción para el SIGUIENTE
    maybeOpenInterceptWindow(state);
  }

  return { ok: true, burned, newCurrentPlayerId: interceptorId };
}

// ─────────────────────────── Sanitización (S→C) ──────────────────────────────

/**
 * Construye la vista sanitizada del estado para un jugador específico.
 * NUNCA incluye las cartas de la mano de otros jugadores ni las ciegas sin voltear.
 */
export function buildGameStateView(
  state: GameState,
  forPlayerId: string,
  roomId: string,
) {
  const selfPlayer = state.players.find(p => p.id === forPlayerId);
  const currentPlayer = getCurrentPlayer(state);

  // Vista propia: tiene acceso completo a su mano.
  // Si por alguna razón el jugador no está en la lista (espectador), se usa un fallback vacío.
  const self: import('./types/game.js').SelfView = selfPlayer
    ? {
        id: selfPlayer.id,
        name: selfPlayer.name,
        avatarColor: selfPlayer.avatarColor,
        seatIndex: selfPlayer.seatIndex,
        status: selfPlayer.status,
        isConnected: selfPlayer.isConnected,
        penaltyCount: selfPlayer.penaltyCount,
        hand: selfPlayer.hand,   // Cartas reales — sólo las ve el propietario
        tableUp: selfPlayer.tableUp,
        tableDownCount: selfPlayer.tableDown.length,
        // Las ciegas propias siguen siendo placeholders hasta voltearlas
        tableDown: selfPlayer.tableDown.map((c): CardBack => ({ id: c.id, faceDown: true })),
      }
    : {
        id: forPlayerId,
        name: '?',
        avatarColor: '#888888',
        seatIndex: -1,
        status: 'waiting' as const,
        isConnected: false,
        penaltyCount: 0,
        hand: [],
        tableUp: [],
        tableDownCount: 0,
        tableDown: [],
      };

  const opponents: import('./types/game.js').PlayerView[] = state.players
    .filter(p => p.id !== forPlayerId)
    .map((p): import('./types/game.js').PlayerView => ({
      id: p.id,
      name: p.name,
      avatarColor: p.avatarColor,
      seatIndex: p.seatIndex,
      status: p.status,
      isConnected: p.isConnected,
      penaltyCount: p.penaltyCount,
      handCount: p.hand.length,
      tableUp: p.tableUp,
      tableDownCount: p.tableDown.length,
      tableDown: p.tableDown.map((c): CardBack => ({ id: c.id, faceDown: true })),
    }));

  return {
    roomId,
    phase: state.phase,
    round: state.round,
    currentPlayerId: currentPlayer?.id ?? '',
    deckCount: state.deck.length,
    discardTopCard: state.discardPile.topCard,
    discardPileCount: state.discardPile.cards.length,
    turnConstraint: state.turnConstraint,
    intercept: state.intercept,
    finishOrder: state.finishOrder,
    self,
    opponents,
    lastActivity: state.lastActivity.slice(-10),
    turnStartedAt: state.turnStartedAt,
  };
}
