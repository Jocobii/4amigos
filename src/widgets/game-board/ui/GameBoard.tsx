// =============================================================================
// 4 Amigos — GameBoard Widget (pixel-faithful redesign)
// Implementa el brief de diseño completo: pozo escalado, drag-to-throw,
// environment, banners, efectos — todo sobre la arquitectura socket/store
// existente.
// =============================================================================

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/src/entities/game';
import { usePlayCard } from '@/src/features/play-card/model/usePlayCard';
import { useIntercept } from '@/src/features/intercept/model/useIntercept';
import { CardFace, CardBackComponent } from '@/src/shared/ui/Card';
import { HowToPlay } from '@/src/features/how-to-play';
import { getSocket } from '@/src/shared/api/socket';
import type {
  Card, CardBack, PlayerView, SelfView, ActivityEvent, ActivityKind,
} from '@/src/shared/types/game';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const TURN_SECONDS = 15;
const POSITIONS = ['north', 'west', 'east'] as const;

// Tiers del pozo
const POZO_TIERS = [
  { min: 0,  label: 'EN MESA',    copy: 'tranqui' },
  { min: 4,  label: 'CALENTANDO', copy: 'va creciendo' },
  { min: 7,  label: 'CALIENTE',   copy: 'cuidado' },
  { min: 11, label: 'EN LLAMAS',  copy: 'se te quema' },
  { min: 16, label: '¡BOMBA!',    copy: 'te la comes toda' },
];

function pozoTier(count: number): number {
  let t = 0;
  for (let i = 0; i < POZO_TIERS.length; i++) {
    if (count >= POZO_TIERS[i]!.min) t = i;
  }
  return t;
}

// Para el stack de cartas debajo — determinista por índice
function pileRandoms(i: number) {
  const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const s2 = Math.sin(i * 39.345  + 11.135) * 17329.1234;
  const s3 = Math.sin(i * 91.27   +  4.500) *  9912.3;
  const s4 = Math.sin(i * 53.811  + 22.881) *  6314.7707;
  return {
    rx: s1 - Math.floor(s1),
    ry: s2 - Math.floor(s2),
    rr: s3 - Math.floor(s3),
    suit: s4 - Math.floor(s4),
  };
}

const SUIT_KEYS = ['oros', 'copas', 'espadas', 'bastos'] as const;
const RANK_POOL = ['3','4','5','6','7','8','9','Q','J','K'];
const SUIT_COLORS = { oros: '#E8FF3D', copas: '#FF2244', espadas: '#9DE5FF', bastos: '#FF6A1A' };

// ─────────────────────────────────────────────────────────────────────────────
// TimerRing
// ─────────────────────────────────────────────────────────────────────────────

function TimerRing({ remaining, total, size = 92 }: { remaining: number; total: number; size?: number }) {
  const r = (size - 12) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const danger = remaining <= 3;
  const stroke = remaining <= 1 ? '#FF2244' : remaining <= 3 ? '#FF6A1A' : '#E8FF3D';
  return (
    <svg className={`timer-ring${danger ? ' timer-danger' : ''}`}
         width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke="rgba(255,255,255,.08)" strokeWidth="4"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
              stroke={stroke} strokeWidth="5"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
              strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StealBanner
// ─────────────────────────────────────────────────────────────────────────────

function StealBanner({ stealer, victim, onDone }: { stealer: string; victim: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="steal-overlay" aria-live="assertive">
      <div className="steal-flash" />
      <div className="steal-banner">
        <div className="steal-banner-bg" />
        <div className="steal-banner-content">
          <div className="steal-kicker">INTERCEPCIÓN</div>
          <div className="steal-title">¡ROBADO!</div>
          <div className="steal-sub">
            <span className="steal-stealer">{stealer}</span>
            <span className="steal-arrow">⟶</span>
            <span className="steal-victim">{victim}</span>
          </div>
        </div>
      </div>
      <div className="steal-banner steal-banner-mirror">
        <div className="steal-banner-bg steal-banner-bg-mirror" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PunishmentOverlay
// ─────────────────────────────────────────────────────────────────────────────

function PunishmentOverlay({ victim, cardCount, onDismiss }: { victim: string; cardCount: number; onDismiss: () => void }) {
  return (
    <div className="punish-overlay" onClick={onDismiss}>
      <div className="punish-vignette" />
      <div className="punish-grid">
        <div className="punish-kicker">CASTIGO</div>
        <div className="punish-title">TE LA COMES</div>
        <div className="punish-victim">{victim}</div>
        <div className="punish-count">
          <span className="punish-count-num">+{cardCount}</span>
          <span className="punish-count-label">CARTAS A LA MANO</span>
        </div>
        <div className="punish-hint">click para tragártelas</div>
      </div>
      <div className="punish-stripes punish-stripes-top" />
      <div className="punish-stripes punish-stripes-bottom" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaction floaters SVG
// ─────────────────────────────────────────────────────────────────────────────

const REACTIONS_SVG: Record<string, React.ReactNode> = {
  clown: (
    <svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#FFE8C7"/>
      <circle cx="16" cy="11" r="5" fill="#FF2244"/>
      <circle cx="11" cy="17" r="2" fill="#0E0B08"/>
      <circle cx="21" cy="17" r="2" fill="#0E0B08"/>
      <circle cx="16" cy="22" r="2" fill="#FF2244"/>
      <path d="M11 26 Q16 29 21 26" stroke="#0E0B08" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  skull: (
    <svg viewBox="0 0 32 32"><path d="M16 4 C 8 4 5 10 5 16 c0 5 3 8 5 9 v4 h4 v-3 h4 v3 h4 v-4 c2 -1 5 -4 5 -9 c0 -6 -3 -12 -11 -12 Z" fill="#F2F0E8"/>
      <circle cx="11" cy="16" r="3" fill="#0E0B08"/>
      <circle cx="21" cy="16" r="3" fill="#0E0B08"/>
      <path d="M14 22 l1 -2 l1 2 l1 -2 l1 2" stroke="#0E0B08" strokeWidth="1.5" fill="none"/>
    </svg>
  ),
  fire: (
    <svg viewBox="0 0 32 32"><path d="M8 22 C 6 16 12 14 11 8 C 16 12 18 6 20 4 C 21 10 25 12 25 18 C 25 24 21 28 16 28 C 11 28 9 26 8 22 Z" fill="#FF6A1A"/>
      <path d="M13 22 C 12 19 16 17 15 14 C 18 17 20 14 20 18 C 20 22 18 25 16 25 C 14 25 13 24 13 22 Z" fill="#E8FF3D"/>
    </svg>
  ),
  zzz: (
    <svg viewBox="0 0 32 32">
      <text x="6" y="14" fontFamily="Anton, Impact, sans-serif" fontSize="11" fill="#9DE5FF">Z</text>
      <text x="13" y="22" fontFamily="Anton, Impact, sans-serif" fontSize="13" fill="#9DE5FF">Z</text>
      <text x="20" y="30" fontFamily="Anton, Impact, sans-serif" fontSize="15" fill="#9DE5FF">Z</text>
    </svg>
  ),
};

const REACTIONS_META = [
  { key: 'clown', label: 'PAYASO' },
  { key: 'skull', label: 'CRÁNEO' },
  { key: 'fire',  label: 'FUEGO' },
  { key: 'zzz',   label: 'DORMIDO' },
];

interface FloatingReact { id: string; kind: string; x: number; y: number; drift: number; }

function ReactionFloater({ kind, x, y, drift, onDone }: FloatingReact & { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="reaction-float" style={{ left: x, top: y, '--drift': `${drift}px` } as React.CSSProperties}>
      <div className="reaction-float-svg">{REACTIONS_SVG[kind]}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HUD Strip
// ─────────────────────────────────────────────────────────────────────────────

function HudStrip({ round, roomId, phase }: { round: number; roomId: string; phase: string }) {
  return (
    <div className="hud-strip">
      <div className="hud-left">
        <div className="hud-pill">
          <span className="hud-dot" />
          <span>EN VIVO · MESA #{roomId}</span>
        </div>
        <div className="hud-pill hud-pill-ghost">RONDA {round}</div>
      </div>
      <div className="hud-center">
        <div className="hud-brand">4 AMIGOS</div>
        <div className="hud-brand-sub">— ROMPE AMISTADES —</div>
      </div>
      <div className="hud-right">
        <div className="hud-pill hud-pill-ghost">
          {phase === 'lobby' ? 'LOBBY' : phase === 'playing' ? 'EN JUEGO' : 'FIN'}
        </div>
        <button className="hud-icon-btn" title="Reglas" aria-label="Ver reglas">?</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Feed
// ─────────────────────────────────────────────────────────────────────────────

function verbForKind(kind: ActivityKind, cardRanks?: string[], targetName?: string): string {
  switch (kind) {
    case 'play': return `tiró ${cardRanks?.join(', ') ?? ''}`;
    case 'take_pile': return 'recogió el pozo';
    case 'burn': return 'QUEMA!';
    case 'intercept': return `robó el turno a ${targetName ?? ''}`;
    case 'intercept_fail': return 'intercepción fallida';
    case 'flip_blind': return `voltea ciega: ${cardRanks?.[0] ?? ''}`;
    case 'join': return 'entró a la mesa';
    case 'leave': return 'se fue';
    case 'win': return '¡ganó!';
    default: return kind;
  }
}

function ActivityFeed({ items }: { items: ActivityEvent[] }) {
  return (
    <div className="activity-feed">
      <div className="activity-head">
        <span className="activity-dot" />
        <span>EN LA MESA</span>
      </div>
      <div className="activity-list">
        {items.slice(-6).reverse().map((it, i) => (
          <div key={it.id} className="activity-item" style={{ opacity: 1 - i * 0.12 }}>
            <span className="activity-actor" style={{ color: it.actorColor }}>{it.actorName}</span>
            <span className="activity-verb">{verbForKind(it.kind, it.cardRanks, it.targetName)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Corner
// ─────────────────────────────────────────────────────────────────────────────

function PlayerCorner({
  player, active, remaining, total, position, isMe, onReact, lastReaction,
}: {
  player: { id: string; name: string; avatarColor: string; handCount?: number; cards?: number };
  active: boolean; remaining: number; total: number;
  position: 'north' | 'south' | 'west' | 'east';
  isMe?: boolean;
  onReact?: (playerId: string, kind: string) => void;
  lastReaction?: { id: number; kind: string } | null;
}) {
  const cardCount = (player as PlayerView).handCount ?? (player as { cards?: number }).cards ?? 0;

  return (
    <div className={`player-corner player-${position}`}>
      <div className="player-cluster">
        {active && !isMe && (
          <div className="timer-wrap">
            <TimerRing remaining={remaining} total={total} size={108} />
          </div>
        )}
        <div className={`avatar ${active ? 'avatar-active' : ''}`}>
          <div className="avatar-disc" style={{ background: player.avatarColor }}>
            {player.name[0]}
          </div>
          {!isMe && <div className="avatar-card-count">{cardCount}</div>}
        </div>
        <div className="player-meta">
          <div className="player-name">{player.name}</div>
        </div>
        {!isMe && onReact && (
          <div className="react-rail">
            {REACTIONS_META.map(r => (
              <button key={r.key} className="react-btn" title={r.label}
                      onClick={() => onReact(player.id, r.key)}
                      aria-label={`${r.label} a ${player.name}`}>
                <div className="react-btn-svg">{REACTIONS_SVG[r.key]}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {lastReaction && (
        <div key={lastReaction.id} className="player-last-react">
          {REACTIONS_SVG[lastReaction.kind]}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pozo — escalating discard pile
// ─────────────────────────────────────────────────────────────────────────────

function PozoUnderCard({ index }: { index: number }) {
  const r = pileRandoms(index);
  const suit = SUIT_KEYS[Math.floor(r.suit * 4)] ?? 'oros';
  const rank = RANK_POOL[Math.floor(r.rx * RANK_POOL.length)] ?? '5';
  const color = SUIT_COLORS[suit as keyof typeof SUIT_COLORS];
  const glyph = { oros: '◆', copas: '♥', espadas: '♠', bastos: '✦' }[suit];
  return (
    <div className="pozo-under-card">
      <div className="pozo-under-rank" style={{ color }}>
        {rank}<span style={{ marginLeft: 2 }}>{glyph}</span>
      </div>
    </div>
  );
}

function Pozo({
  topCard, pileCount, dropHover, justSlammed,
}: {
  topCard: Card | null;
  pileCount: number;
  dropHover: boolean;
  justSlammed: number;
}) {
  const tier = pozoTier(pileCount);
  const tierInfo = POZO_TIERS[tier]!;
  const under = Math.min(Math.max(pileCount - 1, 0), 18);
  const spread = 8 + tier * 12;
  const rotSpread = 6 + tier * 16;
  const meterPct = Math.min(100, (pileCount / 18) * 100);

  const stack = Array.from({ length: under }, (_, i) => {
    const r = pileRandoms(i);
    return {
      x: (r.rx - 0.5) * spread,
      y: (r.ry - 0.5) * spread - i * 0.35,
      rot: (r.rr - 0.5) * rotSpread,
      i,
    };
  });

  return (
    <div className={`pozo pozo-tier-${tier} ${dropHover ? 'pozo-drop-hover' : ''} ${justSlammed ? 'pozo-slammed' : ''}`}>
      {/* Heat aura */}
      <div className="pozo-aura" />
      <div className="pozo-aura pozo-aura-2" />

      {/* Dropzone — invisible hit-test target */}
      <div className="pozo-drop-zone" data-pozo-drop="1" />

      {/* Card stack */}
      <div className="pozo-stack">
        {stack.map((s) => (
          <div key={s.i} className="pozo-under"
               style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`, zIndex: s.i + 1 }}>
            <PozoUnderCard index={s.i} />
          </div>
        ))}
        {/* Top card — key changes on slam so React re-mounts → CSS animation re-runs */}
        <div className="pozo-top" key={`top-${justSlammed}`} style={{ zIndex: 100 }}>
          {topCard
            ? <CardFace card={topCard} size="pile" glow={tier >= 2} />
            : (
              <div style={{
                width: 104, height: 152, borderRadius: 9,
                border: '2px dashed rgba(255,255,255,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(246,239,222,.2)', fontSize: 28,
              }}>—</div>
            )
          }
        </div>
      </div>

      {/* Foot: count + heat meter — floats ABOVE the pile */}
      <div className="pozo-foot">
        <div className="pozo-count-block">
          <div className="pozo-count-num">{pileCount}</div>
          <div className="pozo-count-label">
            <span className="pozo-count-word">EN EL POZO</span>
            <span className="pozo-count-sub">{tierInfo.copy}</span>
          </div>
        </div>
        <div className="pozo-meter-wrap">
          <div className="pozo-meter-track">
            <div className="pozo-meter-fill" style={{ width: `${meterPct}%` }} />
            <div className="pozo-meter-marks">
              {POZO_TIERS.map((tt, k) => (
                <span key={k}
                      className={`pozo-meter-mark${k <= tier ? ' on' : ''}`}
                      style={{ left: `${Math.min(100, (tt.min / 18) * 100)}%` }} />
              ))}
            </div>
          </div>
          <div className={`pozo-tier-label pozo-tier-label-${tier}`}>
            {tierInfo.label}
          </div>
        </div>
      </div>

      {/* Sparks at hot tiers */}
      {tier >= 3 && (
        <div className="pozo-sparks" aria-hidden="true">
          {Array.from({ length: tier === 4 ? 9 : 5 }).map((_, i) => (
            <span key={i} className="pozo-spark" style={{
              left:  `${15 + (i * 73) % 70}%`,
              top:   `${10 + (i * 41) % 70}%`,
              animationDelay: `${(i * 137) % 800}ms`,
            }} />
          ))}
        </div>
      )}

      {/* Skull warning at tier 4 */}
      {tier === 4 && (
        <div className="pozo-skull-warn">
          <span>☠</span><span>SE LA COME TODA</span><span>☠</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deck (draw pile)
// ─────────────────────────────────────────────────────────────────────────────

function DeckStack({ deckCount, onClick }: { deckCount: number; onClick: () => void }) {
  return (
    <button className="deck-stack" onClick={onClick} aria-label="Robar carta">
      {deckCount > 2 && <div className="deck-card deck-card-3" />}
      {deckCount > 1 && <div className="deck-card deck-card-2" />}
      {deckCount > 0
        ? (
          <div className="deck-card deck-card-1">
            <div className="back-grid">
              <div className="back-mono">4A</div>
              <div className="back-mono back-mono-sm">AMIGOS</div>
            </div>
          </div>
        )
        : (
          <div style={{
            width: 104, height: 152, borderRadius: 9,
            border: '2px dashed rgba(255,255,255,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(246,239,222,.2)', fontSize: 28,
          }}>—</div>
        )
      }
      <div className="deck-count">{deckCount}</div>
      <div className="deck-label">MAZO</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand Fan con drag-to-throw
// ─────────────────────────────────────────────────────────────────────────────

interface DragState {
  idx: number;
  cardId: string;
  card: Card;
  x: number; y: number;
  sx: number; sy: number;
  ox: number; oy: number;
  moved: boolean;
  overDrop: boolean;
}

function HandFan({
  cards, selectedIds, draggingIdx, onPointerDownCard,
}: {
  cards: Card[];
  selectedIds: string[];
  draggingIdx: number;
  onPointerDownCard: (idx: number, e: React.PointerEvent) => void;
}) {
  const total = cards.length;
  const mid = (total - 1) / 2;

  return (
    <div className="hand-wrap">
      <div className="hand-fan">
        {cards.map((c, i) => {
          const offset = i - mid;
          const rot = offset * 4;
          const yLift = Math.abs(offset) * 6;
          const isSel = selectedIds.includes(c.id);
          const isDragging = i === draggingIdx;
          return (
            <div key={c.id}
                 className={`hand-slot${isSel ? ' hand-slot-sel' : ''}${isDragging ? ' hand-slot-dragging' : ''}`}
                 style={{
                   transform: `translateX(${offset * 52}px) translateY(${yLift + (isSel ? -28 : 0)}px) rotate(${rot}deg)`,
                   zIndex: isSel ? 100 : 10 + i,
                 }}
                 onPointerDown={(e) => onPointerDownCard(i, e)}>
              <CardFace card={c} lifted={isSel} />
            </div>
          );
        })}
      </div>
      <div className="hand-hint">
        <span className="hand-hint-arrow">↑</span>
        <span>arrastra al pozo · o click + TIRAR</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand Actions
// ─────────────────────────────────────────────────────────────────────────────

function HandActions({ canPlay, onPlay, onClear, onTake }: {
  canPlay: boolean; onPlay: () => void; onClear: () => void; onTake: () => void;
}) {
  return (
    <div className="hand-actions">
      {canPlay && (
        <button className="btn-ghost" onClick={onClear}>
          <span className="kbd">ESC</span>
          <span>Soltar</span>
        </button>
      )}
      <button className={`btn-play${canPlay ? '' : ' btn-play-disabled'}`}
              onClick={onPlay} disabled={!canPlay}>
        <span>TIRAR</span>
        <span className="btn-play-arrow">▸</span>
      </button>
      <button className="btn-ghost" onClick={onTake}>
        <span className="kbd">⤵</span>
        <span>Robar pozo</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn Timer ring (side)
// ─────────────────────────────────────────────────────────────────────────────

function TurnTimerDisplay({ turnStartedAt, currentPlayerId, myId, onTimeout, phase }: {
  turnStartedAt: number; currentPlayerId: string;
  myId: string | null; onTimeout: () => void; phase: string;
}) {
  const [remaining, setRemaining] = React.useState(TURN_SECONDS);
  const timeoutFiredRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (phase !== 'playing' || !turnStartedAt) return;
    timeoutFiredRef.current = false;
    const update = () => {
      const elapsed = (Date.now() - turnStartedAt) / 1000;
      const rem = Math.max(0, TURN_SECONDS - elapsed);
      setRemaining(rem);
      if (rem <= 0 && !timeoutFiredRef.current && currentPlayerId === myId) {
        timeoutFiredRef.current = true;
        onTimeoutRef.current();
      }
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnStartedAt, currentPlayerId, myId, phase]);

  if (phase !== 'playing' || !turnStartedAt) return null;

  const isMyTurn = currentPlayerId === myId;
  const isUrgent = remaining <= 4;
  const color = isUrgent ? '#FF2244' : remaining <= 7 ? '#E8FF3D' : '#22c55e';

  return (
    <div style={{
      position: 'absolute', top: '50%', right: 20,
      transform: 'translateY(-50%)', zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={22} fill="rgba(14,11,8,0.85)" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <circle
          cx={28} cy={28} r={22} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={2 * Math.PI * 22}
          strokeDashoffset={2 * Math.PI * 22 * (1 - remaining / TURN_SECONDS)}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{
            transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s',
            filter: isUrgent ? `drop-shadow(0 0 6px ${color})` : 'none',
          }}
        />
        <text x={28} y={33} textAnchor="middle" fill={color}
              fontSize={isUrgent ? 17 : 15} fontFamily="Anton, sans-serif">
          {Math.ceil(remaining)}
        </text>
      </svg>
      <div style={{
        fontSize: 8, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1,
        color: isMyTurn ? color : 'rgba(246,239,222,0.3)',
        animation: isUrgent && isMyTurn ? 'pulse-dot 0.4s ease-in-out infinite' : 'none',
      }}>
        {isMyTurn ? 'JUEGA!' : 'TURNO'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercept Banner
// ─────────────────────────────────────────────────────────────────────────────

function InterceptBanner({ canIntercept, onIntercept }: { canIntercept: boolean; onIntercept: () => void }) {
  if (!canIntercept) return null;
  return (
    <div style={{
      position: 'absolute', top: '38%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        fontFamily: 'Anton, sans-serif', fontSize: 24, letterSpacing: 4,
        color: '#E8FF3D', textShadow: '0 0 20px #E8FF3D',
      }}>INTERCEPCIÓN</div>
      <button onClick={onIntercept} style={{
        background: '#E8FF3D', color: '#0e0b08', border: 'none',
        padding: '12px 32px', borderRadius: 999,
        fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 2,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(232,255,61,0.5), 0 0 0 3px #0e0b08',
      }}>ROBAR TURNO</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercept Flash
// ─────────────────────────────────────────────────────────────────────────────

function InterceptFlashOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 400, pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(232,255,61,0.35) 0%, rgba(232,255,61,0.08) 50%, transparent 75%)',
      animation: 'fade-in 1.3s ease-out forwards',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: 'Anton, sans-serif', fontSize: 52, letterSpacing: 8,
        color: '#E8FF3D',
        textShadow: '0 0 20px #E8FF3D, 0 0 50px #E8FF3D',
        whiteSpace: 'nowrap',
      }}>
        INTERCEPCION!
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

function Notifications() {
  const notifications = useGameStore(s => s.notifications);
  const dismiss = useGameStore(s => s.dismissNotification);
  const colors = { success: '#22c55e', error: '#FF2244', warning: '#E8FF3D', info: '#9DE5FF' };
  return (
    <div style={{ position: 'absolute', top: 60, right: 16, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map(n => (
        <div key={n.id} onClick={() => dismiss(n.id)} style={{
          background: 'rgba(14,11,8,0.9)', border: `1px solid ${colors[n.type]}`,
          borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
          color: colors[n.type], maxWidth: 280, backdropFilter: 'blur(8px)',
          animation: 'slide-in 0.25s ease-out',
        }}>{n.message}</div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite Lobby Panel
// ─────────────────────────────────────────────────────────────────────────────

function InviteLobbyPanel({ roomId, players, selfName, selfColor }: {
  roomId: string; players: PlayerView[]; selfName: string; selfColor: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const MAX = 4;

  const getLink = () => typeof window !== 'undefined'
    ? window.location.origin + window.location.pathname + '?room=' + roomId
    : '';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(getLink()); }
    catch { const el = document.createElement('textarea'); el.value = getLink(); document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWA = () => window.open('https://wa.me/?text=' + encodeURIComponent('Juega 4 Amigos conmigo! ' + getLink()), '_blank');

  const allP = [
    ...(selfName ? [{ name: selfName, avatarColor: selfColor, id: 'self' }] : []),
    ...players.map(p => ({ name: p.name, avatarColor: p.avatarColor, id: p.id })),
  ];

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 35, width: 'min(340px, calc(100vw - 32px))',
      background: 'rgba(14,11,8,0.94)', border: '1px solid rgba(255,106,26,0.25)',
      borderRadius: 14, padding: '28px 28px 24px',
      backdropFilter: 'blur(16px)', boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 3, color: 'rgba(246,239,222,0.4)', marginBottom: 6 }}>CODIGO DE SALA</div>
        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, letterSpacing: 8, color: '#FF6A1A', textShadow: '0 0 24px rgba(255,106,26,0.4)' }}>{roomId}</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2, color: 'rgba(246,239,222,0.4)', marginBottom: 8 }}>JUGADORES ({allP.length}/{MAX})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: MAX }).map((_, i) => {
            const p = allP[i];
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                background: p ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                border: p ? '1px solid rgba(255,255,255,0.1)' : '1px dashed rgba(255,255,255,0.08)',
              }}>
                {p ? (
                  <>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton, sans-serif', fontSize: 13, color: '#0e0b08', flexShrink: 0 }}>{p.name[0]}</div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#f6efde' }}>{p.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#22c55e', letterSpacing: 1 }}>LISTO</span>
                  </>
                ) : (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(246,239,222,0.2)', letterSpacing: 1 }}>Esperando jugador...</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={copyLink} style={{ flex: 1, padding: '11px 8px', background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,106,26,0.12)', border: '1.5px solid ' + (copied ? 'rgba(34,197,94,0.5)' : 'rgba(255,106,26,0.35)'), borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 12, letterSpacing: 2, color: copied ? '#22c55e' : '#FF6A1A', transition: 'all 0.2s' }}>
          {copied ? 'COPIADO!' : 'COPIAR LINK'}
        </button>
        <button onClick={shareWA} style={{ flex: 1, padding: '11px 8px', background: 'rgba(37,211,102,0.1)', border: '1.5px solid rgba(37,211,102,0.35)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 12, letterSpacing: 2, color: '#25D366', transition: 'all 0.2s' }}>
          WHATSAPP
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(246,239,222,0.3)', letterSpacing: 1 }}>Mínimo 2 jugadores para iniciar</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game End Screen
// ─────────────────────────────────────────────────────────────────────────────

function GameEndScreen() {
  const gameEnd = useGameStore(s => s.gameEnd);
  const socketId = useGameStore(s => s.socketId);
  if (!gameEnd) return null;

  const isWinner = socketId === gameEnd.winnerId;
  const isLoser  = socketId === gameEnd.loserId && !isWinner;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{
        textAlign: 'center',
        background: 'rgba(14,11,8,0.97)',
        border: `1px solid ${isWinner ? 'rgba(232,255,61,0.5)' : isLoser ? 'rgba(255,34,68,0.5)' : 'rgba(255,106,26,0.3)'}`,
        borderRadius: 16, padding: '48px 56px',
        boxShadow: isWinner ? '0 0 60px rgba(232,255,61,0.2)' : '0 20px 60px rgba(0,0,0,0.8)',
        maxWidth: 460, width: 'calc(100vw - 32px)',
      }}>
        {isWinner && (
          <>
            <div style={{ fontSize: 56, marginBottom: 4 }}>🏆</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#E8FF3D', letterSpacing: 4, textShadow: '0 0 30px #E8FF3D' }}>GANASTE</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>Primero en salir. Eres el amo.</div>
          </>
        )}
        {isLoser && (
          <>
            <div style={{ fontSize: 52, marginBottom: 4 }}>💩</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#FF2244', letterSpacing: 4 }}>SHITHEAD</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>{gameEnd.loserName} es el shithead de la noche.</div>
          </>
        )}
        {!isWinner && !isLoser && (
          <>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#FF6A1A', letterSpacing: 4 }}>FIN</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>{gameEnd.loserName} es el shithead de la noche.</div>
          </>
        )}
        <div style={{ margin: '20px 0 24px', padding: '12px 20px', background: 'rgba(232,255,61,0.07)', border: '1px solid rgba(232,255,61,0.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2, color: 'rgba(246,239,222,0.4)', marginBottom: 4 }}>GANADOR</div>
          <div style={{ fontSize: 22, fontFamily: 'Anton, sans-serif', color: '#E8FF3D', letterSpacing: 2 }}>🥇 {gameEnd.winnerName}</div>
        </div>
        <div style={{ marginBottom: 32 }}>
          {gameEnd.finishOrder.map(p => (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 32, padding: '8px 12px', borderRadius: 6, marginBottom: 4,
              background: p.id === gameEnd.loserId ? 'rgba(255,34,68,0.08)' : p.id === gameEnd.winnerId ? 'rgba(232,255,61,0.08)' : 'transparent',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
              color: p.id === gameEnd.loserId ? '#FF2244' : p.id === gameEnd.winnerId ? '#E8FF3D' : '#f6efde',
              border: p.id === socketId ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 18 }}>{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '💩'}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              <span style={{ opacity: 0.5 }}>#{p.rank}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => getSocket().emit('RESTART_GAME')} style={{ padding: '14px 28px', background: '#E8FF3D', border: 'none', borderRadius: 6, color: '#0e0b08', fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 2, cursor: 'pointer', boxShadow: '0 0 20px rgba(232,255,61,0.3)' }}>REVANCHA</button>
          <button onClick={() => window.location.reload()} style={{ padding: '14px 28px', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#f6efde', fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 2, cursor: 'pointer' }}>NUEVO LOBBY</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SelfHand — mano del jugador sur (tabla arriba + ciega si aplica)
// ─────────────────────────────────────────────────────────────────────────────

function SelfTableCards({ self, selectedIds, onToggle, isMyTurn, onPlay }: {
  self: SelfView; selectedIds: string[]; onToggle: (id: string) => void;
  isMyTurn: boolean; onPlay: () => void;
}) {
  const playingFromTableUp = self.hand.length === 0 && self.tableUp.length > 0;
  const playingBlind = self.hand.length === 0 && self.tableUp.length === 0 && self.tableDownCount > 0;

  if (playingFromTableUp) {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {self.tableUp.map(c => (
          <CardFace key={c.id} card={c} size="hand"
            selected={selectedIds.includes(c.id)}
            onClick={() => isMyTurn && onToggle(c.id)}
            dim={!isMyTurn} />
        ))}
      </div>
    );
  }
  if (playingBlind) {
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {self.tableDown.map(cb => (
          <CardBackComponent key={cb.id} card={cb} size="hand"
            onClick={() => isMyTurn && onPlay()} />
        ))}
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GAMEBOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function GameBoard() {
  const gameView          = useGameStore(s => s.gameView);
  const socketId          = useGameStore(s => s.socketId);
  const interceptActive   = useGameStore(s => s.interceptActive);
  const burnActive        = useGameStore(s => s.burnActive);
  const selectedCardIds   = useGameStore(s => s.selectedCardIds);
  const toggleCardSel     = useGameStore(s => s.toggleCardSelection);
  const clearSel          = useGameStore(s => s.clearSelection);
  const addFloatReact     = useGameStore(s => s.addFloatingReaction);

  const { playSelected, takePile, flipBlind, startGame, isMyTurn } = usePlayCard();
  const { canIntercept, interceptTurn } = useIntercept();

  // Local UI state
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [slamPulse, setSlamPulse] = React.useState(0);
  const [localReactions, setLocalReactions] = React.useState<FloatingReact[]>([]);
  const [lastReacts, setLastReacts] = React.useState<Record<string, { id: number; kind: string }>>({});
  const [steal, setSteal] = React.useState<{ stealer: string; victim: string } | null>(null);
  const [punish, setPunish] = React.useState<{ victim: string; cardCount: number } | null>(null);
  const [timerRemaining, setTimerRemaining] = React.useState(TURN_SECONDS);

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameView || gameView.phase !== 'playing' || !gameView.turnStartedAt) return;
    const update = () => {
      const elapsed = (Date.now() - gameView.turnStartedAt) / 1000;
      setTimerRemaining(Math.max(0, TURN_SECONDS - elapsed));
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [gameView?.turnStartedAt, gameView?.phase, gameView?.currentPlayerId]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') clearSel();
      if (e.key === 'Enter' && selectedCardIds.length > 0) handlePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardIds]);

  // ── Drag-to-throw ──────────────────────────────────────────────────────────
  const handleCardPointerDown = useCallback((idx: number, e: React.PointerEvent) => {
    if (!gameView?.self) return;
    e.preventDefault();
    const card = gameView.self.hand[idx];
    if (!card) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({
      idx,
      cardId: card.id,
      card,
      x: e.clientX, y: e.clientY,
      sx: e.clientX, sy: e.clientY,
      ox: e.clientX - (rect.left + rect.width / 2),
      oy: e.clientY - (rect.top  + rect.height / 2),
      moved: false,
      overDrop: false,
    });
  }, [gameView]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      const moved = drag.moved || (dx*dx + dy*dy > 36);
      const zone = document.querySelector('[data-pozo-drop="1"]');
      let overDrop = false;
      if (zone) {
        const r = zone.getBoundingClientRect();
        overDrop = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      setDrag(d => d ? { ...d, x: e.clientX, y: e.clientY, moved, overDrop } : null);
    };
    const onUp = () => {
      if (!drag) return;
      if (drag.overDrop && drag.moved) {
        // SLAM
        toggleCardSel(drag.cardId);
        // We select then play — simpler: directly emit through playSelected after selection
        useGameStore.getState().toggleCardSelection(drag.cardId);
        // Force the selection then play
        const store = useGameStore.getState();
        const alreadySelected = store.selectedCardIds.includes(drag.cardId);
        if (!alreadySelected) {
          store.toggleCardSelection(drag.cardId);
        }
        setSlamPulse(p => p + 1);
        setTimeout(() => {
          playSelected();
        }, 0);
      } else if (!drag.moved) {
        toggleCardSel(drag.cardId);
      }
      setDrag(null);
    };
    const onCancel = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const handlePlay = () => {
    if (gameView?.self && gameView.self.hand.length === 0 && gameView.self.tableUp.length === 0 && gameView.self.tableDownCount > 0) {
      const blind = gameView.self.tableDown[0];
      if (blind) flipBlind(blind.id);
    } else {
      playSelected();
    }
  };

  const onReact = (playerId: string, kind: string) => {
    const p = gameView?.opponents.find(x => x.id === playerId);
    if (!p) return;
    const positions: Record<string, { x: number; y: number }> = {
      north: { x: window.innerWidth / 2,        y: 160 },
      west:  { x: 200,                           y: window.innerHeight / 2 },
      east:  { x: window.innerWidth - 200,       y: window.innerHeight / 2 },
    };
    const oppIdx = gameView!.opponents.indexOf(p);
    const pos = positions[POSITIONS[oppIdx % 3]!] ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const id = Date.now() + Math.random();
    const drift = (Math.random() - 0.5) * 80;
    setLocalReactions(rs => [...rs, { id: String(id), kind, x: pos.x, y: pos.y, drift }]);
    setLastReacts(lr => ({ ...lr, [playerId]: { id: Date.now(), kind } }));
    // Also send via socket if you want multiplayer reactions
    getSocket().emit('SEND_REACTION', { emoji: kind });
  };

  if (!gameView) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0807', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f6efde', fontFamily: 'Anton, sans-serif', fontSize: 24, letterSpacing: 4 }}>
        CARGANDO MESA...
      </div>
    );
  }

  const {
    self, opponents, phase, discardTopCard, discardPileCount, deckCount,
    lastActivity, round, roomId, currentPlayerId, turnStartedAt,
  } = gameView;

  const dropHover = !!(drag && drag.overDrop && drag.moved);

  return (
    <div className="stage stage-patio">
      {/* ── Environment layers ────────────────────────────────── */}
      <div className="env-wood" />
      <div className="env-vignette" />
      <div className="env-lights" />
      <div className="env-neon" />
      <div className="env-grain" />
      <div className="table-disc" />

      {/* ── HUD ──────────────────────────────────────────────── */}
      <HudStrip round={round} roomId={roomId} phase={phase} />

      {/* ── Activity Feed ────────────────────────────────────── */}
      <ActivityFeed items={lastActivity} />

      {/* ── Opponent corners ─────────────────────────────────── */}
      {opponents.map((opp, i) => (
        <PlayerCorner
          key={opp.id}
          player={opp}
          active={currentPlayerId === opp.id}
          remaining={timerRemaining}
          total={TURN_SECONDS}
          position={POSITIONS[i % 3]!}
          onReact={onReact}
          lastReaction={lastReacts[opp.id] ?? null}
        />
      ))}

      {/* ── Center: deck + pozo ──────────────────────────────── */}
      {phase === 'lobby' ? (
        <InviteLobbyPanel
          roomId={roomId}
          players={opponents}
          selfName={self?.name ?? ''}
          selfColor={self?.avatarColor ?? '#FF6A1A'}
        />
      ) : (
        <div className="center-table">
          <DeckStack deckCount={deckCount} onClick={takePile} />
          <Pozo
            topCard={discardTopCard}
            pileCount={discardPileCount}
            dropHover={dropHover}
            justSlammed={slamPulse}
          />
        </div>
      )}

      {/* ── Turn timer (right side) ───────────────────────────── */}
      {phase === 'playing' && (
        <TurnTimerDisplay
          turnStartedAt={turnStartedAt}
          currentPlayerId={currentPlayerId}
          myId={socketId}
          phase={phase}
          onTimeout={takePile}
        />
      )}

      {/* ── Intercept overlay ────────────────────────────────── */}
      <InterceptFlashOverlay active={interceptActive} />
      <InterceptBanner canIntercept={canIntercept} onIntercept={interceptTurn} />

      {/* ── Bottom bar: me zone + hand + actions ─────────────── */}
      {self && (
        <div className="bottom-bar">
          {/* Me zone */}
          <div className="me-zone">
            <PlayerCorner
              player={{ id: self.id, name: self.name, avatarColor: self.avatarColor }}
              active={currentPlayerId === self.id}
              remaining={timerRemaining}
              total={TURN_SECONDS}
              position="south"
              isMe
            />
            {currentPlayerId === self.id && phase === 'playing' && (
              <div className="me-turn-badge">
                <TimerRing remaining={timerRemaining} total={TURN_SECONDS} size={40} />
                <div className="me-turn-badge-text">
                  <div className="me-turn-badge-label">TU TURNO</div>
                  <div className="me-turn-badge-time">{Math.ceil(timerRemaining)}s restantes</div>
                </div>
              </div>
            )}
          </div>

          {/* Table cards (if hand is empty) */}
          {self.hand.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <SelfTableCards
                self={self}
                selectedIds={selectedCardIds}
                onToggle={toggleCardSel}
                isMyTurn={isMyTurn}
                onPlay={handlePlay}
              />
              {/* Table up small preview if we still have hand */}
              {self.tableUp.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {self.tableUp.map(c => <CardFace key={c.id} card={c} size="small" />)}
                </div>
              )}
            </div>
          )}

          {/* Hand fan */}
          {self.hand.length > 0 && (
            <HandFan
              cards={self.hand}
              selectedIds={selectedCardIds}
              draggingIdx={drag && drag.moved ? drag.idx : -1}
              onPointerDownCard={handleCardPointerDown}
            />
          )}

          {/* Actions */}
          {phase === 'playing' && (
            <HandActions
              canPlay={selectedCardIds.length > 0 || (self.hand.length === 0 && self.tableUp.length === 0 && self.tableDownCount > 0)}
              onPlay={handlePlay}
              onClear={clearSel}
              onTake={takePile}
            />
          )}
          {phase === 'lobby' && (
            <div className="hand-actions">
              <button className="btn-play" onClick={startGame}>INICIAR PARTIDA</button>
            </div>
          )}
        </div>
      )}

      {/* ── Drag ghost ───────────────────────────────────────── */}
      {drag && drag.moved && (
        <div
          className={`drag-ghost${drag.overDrop ? ' drag-ghost-over' : ''}`}
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy }}
        >
          <CardFace card={drag.card} size="hand" glow={drag.overDrop} />
          {drag.overDrop && <div className="drag-ghost-drop-cue">SOLTAR</div>}
        </div>
      )}

      {/* Global drag hint (not over the dropzone) */}
      {drag && drag.moved && !drag.overDrop && (
        <div className="drag-hint">
          <span>arrástrala al</span>
          <span className="drag-hint-strong">POZO</span>
        </div>
      )}

      {/* ── Local reaction floaters ──────────────────────────── */}
      {localReactions.map(r => (
        <ReactionFloater
          key={r.id}
          {...r}
          onDone={() => setLocalReactions(rs => rs.filter(x => x.id !== r.id))}
        />
      ))}

      {/* ── Store floating reactions (from socket) ────────────── */}
      {useGameStore.getState().floatingReactions.map(r => (
        <div key={r.id} style={{ position: 'absolute', left: `${r.x}%`, bottom: '22%', animation: 'float-up 2.8s ease-out forwards', pointerEvents: 'none', zIndex: 180 }}>
          <div style={{ fontSize: 44, lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}>{r.emoji}</div>
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: r.color, textAlign: 'center' }}>{r.playerName}</div>
        </div>
      ))}

    </div>
  );
}
