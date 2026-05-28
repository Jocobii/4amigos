// =============================================================================
// 4 Amigos — GameBoard Widget
// Full design: flick gesture, special card anims, Gordo Glotón,
// turn-flow ring, animated emoji reactions.
// =============================================================================

'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '@/src/entities/game';
import { usePlayCard } from '@/src/features/play-card/model/usePlayCard';
import { useIntercept } from '@/src/features/intercept/model/useIntercept';
import { CardFace, CardBackComponent } from '@/src/shared/ui/Card';
import { getSocket } from '@/src/shared/api/socket';
import type {
  Card, CardBack, PlayerView, SelfView, ActivityEvent, ActivityKind,
} from '@/src/shared/types/game';

// ─── Constants ───────────────────────────────────────────────────────────────

const TURN_SECONDS = 15;
const POSITIONS = ['north', 'west', 'east'] as const;

const POZO_TIERS = [
  { min: 0, label: 'EN MESA', copy: 'tranqui' },
  { min: 4, label: 'CALENTANDO', copy: 'va creciendo' },
  { min: 7, label: 'CALIENTE', copy: 'cuidado' },
  { min: 11, label: 'EN LLAMAS', copy: 'se te quema' },
  { min: 16, label: '¡BOMBA!', copy: 'te la comes toda' },
];

function pozoTier(count: number): number {
  let t = 0;
  for (let i = 0; i < POZO_TIERS.length; i++) {
    if (count >= POZO_TIERS[i]!.min) t = i;
  }
  return t;
}

function pileRandoms(i: number) {
  const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const s2 = Math.sin(i * 39.345 + 11.135) * 17329.1234;
  const s3 = Math.sin(i * 91.27 + 4.500) * 9912.3;
  const s4 = Math.sin(i * 53.811 + 22.881) * 6314.7707;
  return { rx: s1 - Math.floor(s1), ry: s2 - Math.floor(s2), rr: s3 - Math.floor(s3), suit: s4 - Math.floor(s4) };
}

const SUIT_KEYS = ['oros', 'copas', 'espadas', 'bastos'] as const;
const RANK_POOL = ['3', '4', '5', '6', '7', '8', '9', 'Q', 'J', 'K'];
const SUIT_COLORS = { oros: '#E8FF3D', copas: '#FF2244', espadas: '#9DE5FF', bastos: '#FF6A1A' };

// ─── TWEMOJI — high-quality SVG emoji from CDN ───────────────────────────────
// Uses the official Twemoji CDN (Twitter/X, open source MIT + CC-BY 4.0)

function TwEmoji({ emoji, size = 28 }: { emoji: string; size?: number }) {
  // Build the codepoint string (handles emoji with ZWJ/variation selectors)
  const cp = [...emoji]
    .map(c => c.codePointAt(0)?.toString(16).padStart(4, '0'))
    .filter(Boolean)
    .join('-')
    .replace(/-fe0f/g, ''); // strip variation selectors that Twemoji omits
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg`}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', objectFit: 'contain', imageRendering: 'crisp-edges' }}
    />
  );
}

// ─── REACTIONS META (Twemoji-powered) ────────────────────────────────────────

const REACTIONS_META = [
  { key: 'clown', label: 'PAYASO', emoji: '🤡' },
  { key: 'skull', label: 'CRÁNEO', emoji: '💀' },
  { key: 'fire', label: 'FUEGO', emoji: '🔥' },
  { key: 'zzz', label: 'DORMIDO', emoji: '😴' },
  { key: 'laugh', label: 'JAJAJA', emoji: '😂' },
  { key: 'thumbdown', label: 'MALO', emoji: '👎' },
  { key: 'snail', label: 'LENTO', emoji: '🐌' },
  { key: 'poop', label: 'CACA', emoji: '💩' },
  { key: 'banana', label: 'RESBALA', emoji: '🍌' },
  { key: 'eyes', label: 'OJITOS', emoji: '👀' },
];

// Helper: get emoji char for a reaction key
function reactionEmoji(key: string): string {
  return REACTIONS_META.find(r => r.key === key)?.emoji ?? '❓';
}

interface FloatingReact { id: string; kind: string; x: number; y: number; drift: number; }

function ReactionFloater({ kind, x, y, drift, onDone }: FloatingReact & { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="reaction-float" style={{ left: x, top: y, '--drift': `${drift}px` } as React.CSSProperties}>
      <div className="reaction-float-svg">
        <TwEmoji emoji={reactionEmoji(kind)} size={36} />
      </div>
    </div>
  );
}

// ─── TimerRing ────────────────────────────────────────────────────────────────

function TimerRing({ remaining, total, size = 92 }: { remaining: number; total: number; size?: number }) {
  const r = (size - 12) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const danger = remaining <= 3;
  const stroke = remaining <= 1 ? '#FF2244' : remaining <= 3 ? '#FF6A1A' : '#E8FF3D';
  return (
    <svg className={`timer-ring${danger ? ' timer-danger' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth="5"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

// ─── AvatarTimerRing — anillo SVG sobre el avatar del oponente activo ────────
// Se posiciona con inset negativo para envolver el avatar-disc (72px base).

function AvatarTimerRing({ remaining, total }: { remaining: number; total: number }) {
  const size = 84; // avatar 72px + 6px padding cada lado
  const sw = 4;
  const r = (size - sw) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const stroke = remaining <= 1 ? '#FF2244' : remaining <= 3 ? '#FF6A1A' : '#E8FF3D';
  const danger = remaining <= 3;
  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: 'absolute', inset: -6, pointerEvents: 'none', zIndex: 3, overflow: 'visible' }}
      className={danger ? 'timer-danger' : undefined}
    >
      {/* Track tenue */}
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={sw} />
      {/* Arco de progreso */}
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={stroke} strokeWidth={sw}
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset .2s linear, stroke .3s' }} />
    </svg>
  );
}

// ─── StealBanner ─────────────────────────────────────────────────────────────

function StealBanner({ stealer, victim, onDone }: { stealer: string; victim: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1800); return () => clearTimeout(t); }, [onDone]);
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

// ─── PunishmentOverlay ────────────────────────────────────────────────────────

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

// ─── SpecialCardAnim ─────────────────────────────────────────────────────────

type SpecialKind = 'burn' | 'reset' | 'block' | 'ace';

const SPECIAL_CONFIG: Record<SpecialKind, { bg: string; text: string; label: string }> = {
  burn: { bg: 'special-anim-burn', text: 'special-anim-burn-text', label: '🔥 QUEMA!' },
  reset: { bg: 'special-anim-reset', text: 'special-anim-reset-text', label: '♻ RESET' },
  block: { bg: 'special-anim-block', text: 'special-anim-block-text', label: '🚫 BLOQUEO' },
  ace: { bg: 'special-anim-ace', text: 'special-anim-ace-text', label: 'AS REINA' },
};

function SpecialCardAnim({ kind }: { kind: SpecialKind }) {
  const cfg = SPECIAL_CONFIG[kind];
  return (
    <div className={`special-card-anim ${cfg.bg}`}>
      <div className={cfg.text}>{cfg.label}</div>
    </div>
  );
}

// ─── GordoGloton ─────────────────────────────────────────────────────────────

const NOM_WORDS = ['NOM', 'GULP', 'ÑAM', 'NOM', 'CRUNCH', 'ÑAM'];
const MINI_RANKS = ['A', 'K', 'Q', 'J', '10', '7', '2'];

function GordoGloton({ onDone }: { onDone: () => void }) {
  const [nomIdx, setNomIdx] = useState(0);
  const [exiting, setExiting] = useState(false);
  // Guardamos onDone en ref para que el useEffect no se reinicie con cada render
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const nomInterval = setInterval(() => setNomIdx(i => (i + 1) % NOM_WORDS.length), 340);
    // Duración reducida a 2.2s para no estorbar el gameplay
    const exitTimer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDoneRef.current(), 400);
    }, 2200);
    return () => { clearInterval(nomInterval); clearTimeout(exitTimer); };
  }, []); // sin deps — corre solo al montar

  // 5 mini-cards en espiral (reducidas para no tapar tanto)
  const miniCards = MINI_RANKS.slice(0, 5).map((rank, i) => {
    const angle = (i / 5) * 360;
    const radius = 100 + (i % 3) * 28;
    const dur = 0.8 + i * 0.12;
    const delay = i * 0.07;
    return (
      <div key={i} className="gordo-mini-card"
        style={{
          left: '50%', top: '50%',
          marginLeft: -14, marginTop: -20,
          '--start-rot': `${angle}deg`,
          '--radius': `${radius}px`,
          '--dur': `${dur}s`,
          '--delay': `${delay}s`,
        } as React.CSSProperties}>
        {rank}
      </div>
    );
  });

  return (
    <div className="gordo-overlay">
      {miniCards}
      <div className={`gordo-face-wrap${exiting ? ' gordo-face-exit' : ''}`}>
        <div className="gordo-nom" key={nomIdx}>{NOM_WORDS[nomIdx]}</div>
        <div className="gordo-face">
          <div className="gordo-eye gordo-eye-l"><div className="gordo-pupil" /></div>
          <div className="gordo-eye gordo-eye-r"><div className="gordo-pupil" /></div>
          <div className="gordo-mouth-wrap">
            <div className="gordo-teeth">
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="gordo-tooth" />)}
            </div>
            <div className="gordo-tongue"><div className="gordo-tongue-line" /></div>
          </div>
          <div className="gordo-drool gordo-drool-l" />
          <div className="gordo-drool gordo-drool-r" />
        </div>
      </div>
    </div>
  );
}

// ─── TurnFlowRing ─────────────────────────────────────────────────────────────
// Flechas de dirección claras sobre el anillo. Sin IIFEs para evitar errores TS.

function TurnFlowRing({
  playerOrder, currentPlayerId, playerColors,
}: {
  playerOrder: string[];
  currentPlayerId: string;
  playerColors: Record<string, string>;
}) {
  const R = 200;
  const size = (R + 36) * 2;
  const cx = size / 2;
  const cy = size / 2;

  const posAngles = [-90, 0, 90, 180]; // top, right, bottom, left
  const activeIdx = playerOrder.indexOf(currentPlayerId);
  const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % playerOrder.length : -1;

  // Pre-computar la flecha activa ANTES del return (evita IIFE dentro de JSX)
  let activeArrowMx = 0, activeArrowMy = 0, activeArrowRot = 0;
  let activeArrowLx = 0, activeArrowLy = 0;
  let showActiveArrow = false;
  if (activeIdx >= 0 && nextIdx >= 0) {
    let fromDeg = posAngles[activeIdx] ?? 0;
    let toDeg = posAngles[nextIdx] ?? 0;
    if (toDeg >= fromDeg) toDeg -= 360;
    const midDeg = (fromDeg + toDeg) / 2;
    const midRad = (midDeg * Math.PI) / 180;
    activeArrowMx = cx + R * Math.cos(midRad);
    activeArrowMy = cy + R * Math.sin(midRad);
    activeArrowRot = midDeg - 90;
    activeArrowLx = cx + (R - 46) * Math.cos(midRad);
    activeArrowLy = cy + (R - 46) * Math.sin(midRad);
    showActiveArrow = true;
  }

  return (
    <svg className="turn-flow-ring" width={size} height={size}
      viewBox={`0 0 ${size} ${size}`} style={{ pointerEvents: 'none' }}>

      {/* Anillo base */}
      <circle cx={cx} cy={cy} r={R} fill="none"
        stroke="rgba(255,255,255,.07)" strokeWidth="2" strokeDasharray="6 10" />

      {/* Flechas de dirección — una entre cada par de posiciones */}
      {posAngles.map((deg, i) => {
        const midDeg = deg + 45; // mitad entre posición i y siguiente (clockwise)
        const rad = (midDeg * Math.PI) / 180;
        const ax = cx + R * Math.cos(rad);
        const ay = cy + R * Math.sin(rad);
        const arrowRot = midDeg + 90; // tangente que apunta en la dirección de juego
        const isHot = i === activeIdx && nextIdx >= 0;
        const fill = isHot ? '#FF6A1A' : 'rgba(255,255,255,.22)';
        const filt = isHot
          ? 'drop-shadow(0 0 6px #FF6A1A)'
          : 'none';
        return (
          <g key={i} transform={`translate(${ax},${ay}) rotate(${arrowRot})`}>
            {/* Chevron doble para más visibilidad */}
            <polygon points="-9,0 0,-14 9,0 6,0 0,-8 -6,0"
              fill={fill}
              style={{ filter: filt, transition: 'fill .3s, filter .3s' }} />
          </g>
        );
      })}

      {/* Flecha pulsante grande entre jugador activo → siguiente */}
      {showActiveArrow && (
        <g transform={`translate(${activeArrowMx},${activeArrowMy}) rotate(${activeArrowRot})`}
          className="turn-flow-pulse-arrow">
          <polygon points="-13,0 0,-20 13,0 9,0 0,-12 -9,0"
            fill="#E8FF3D"
            style={{ filter: 'drop-shadow(0 0 10px #E8FF3D) drop-shadow(0 0 20px rgba(232,255,61,.6))' }} />
        </g>
      )}
      {showActiveArrow && (
        <text x={activeArrowLx} y={activeArrowLy + 4} textAnchor="middle"
          fill="rgba(232,255,61,.6)"
          fontSize="9" fontFamily="JetBrains Mono,monospace">
          TURNO
        </text>
      )}

      {/* Badges de jugadores */}
      {playerOrder.map((pid, i) => {
        const deg = posAngles[i] ?? 0;
        const rad = (deg * Math.PI) / 180;
        const bx = cx + R * Math.cos(rad);
        const by = cy + R * Math.sin(rad);
        const isActive = pid === currentPlayerId;
        const isNext = i === nextIdx;
        const color = playerColors[pid] ?? '#666';
        return (
          <g key={pid}>
            {isNext && (
              <circle cx={bx} cy={by} r={20}
                fill="none" stroke="rgba(232,255,61,.3)" strokeWidth="2"
                className="turn-flow-next-halo" />
            )}
            <circle cx={bx} cy={by}
              r={isActive ? 14 : isNext ? 11 : 9}
              fill={isActive ? color : 'rgba(0,0,0,.7)'}
              stroke={isActive ? color : isNext ? 'rgba(232,255,61,.7)' : 'rgba(255,255,255,.15)'}
              strokeWidth={isActive ? 2 : isNext ? 1.5 : 1}
              style={{
                filter: isActive
                  ? `drop-shadow(0 0 10px ${color})`
                  : isNext ? 'drop-shadow(0 0 6px rgba(232,255,61,.5))' : 'none',
                transition: 'all .3s',
              }} />
            <text x={bx} y={by + 5} textAnchor="middle"
              fill={isActive ? '#0e0b08' : 'rgba(255,255,255,.6)'}
              fontSize="12" fontFamily="Anton,sans-serif"
              className="turn-flow-badge">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── HUD Strip ────────────────────────────────────────────────────────────────

function HudStrip({ round, roomId, phase }: {
  round: number; roomId: string; phase: string;
}) {
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
      </div>
    </div>
  );
}

// ─── Watermark ────────────────────────────────────────────────────────────────

function Watermark() {
  return (
    <div className="watermark" aria-hidden="true">
      By Jocobi with&nbsp;
      <span className="watermark-heart">♥</span>
    </div>
  );
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

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
            <span className="activity-verb"> {verbForKind(it.kind, it.cardRanks, it.targetName)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PlayerCorner ─────────────────────────────────────────────────────────────

function PlayerCorner({
  player, active, remaining, total, position, isMe, lastReaction,
}: {
  player: {
    id: string; name: string; avatarColor: string;
    handCount?: number; tableUp?: Card[]; tableDownCount?: number;
  };
  active: boolean; remaining: number; total: number;
  position: 'north' | 'south' | 'west' | 'east';
  isMe?: boolean;
  lastReaction?: { id: number; kind: string } | null;
}) {
  const cardCount = (player as PlayerView).handCount ?? 0;
  const tableUp = player.tableUp ?? [];
  const tableDownCount = player.tableDownCount ?? 0;
  return (
    <div className={`player-corner player-${position}`}>
      <div className="player-cluster">
        <div className={`avatar${active ? ' avatar-active' : ''}`}>
          {/* Anillo-timer sobre el avatar cuando es su turno */}
          {active && !isMe && (
            <AvatarTimerRing remaining={remaining} total={total} />
          )}
          <div className="avatar-disc" style={{ background: player.avatarColor }}>
            {player.name[0]}
          </div>
          {!isMe && <div className="avatar-card-count">{cardCount}</div>}
        </div>
        <div className="player-meta">
          <div className="player-name">{player.name}</div>
        </div>
      </div>
      {/* Mini mesa del oponente — siempre visible cuando hay cartas */}
      {!isMe && (
        <OpponentMesa tableUp={tableUp} tableDownCount={tableDownCount} />
      )}
      {lastReaction && (
        <div key={lastReaction.id} className="player-last-react">
          <TwEmoji emoji={reactionEmoji(lastReaction.kind)} size={40} />
        </div>
      )}
    </div>
  );
}

// ─── Pozo ─────────────────────────────────────────────────────────────────────

function PozoUnderCard({ index }: { index: number }) {
  const r = pileRandoms(index);
  const suit = SUIT_KEYS[Math.floor(r.suit * 4)] ?? 'oros';
  const rank = RANK_POOL[Math.floor(r.rx * RANK_POOL.length)] ?? '5';
  const color = SUIT_COLORS[suit as keyof typeof SUIT_COLORS];
  const glyph = { oros: '◆', copas: '♥', espadas: '♠', bastos: '✦' }[suit];
  return (
    <div className="pozo-under-card">
      <div className="pozo-under-rank" style={{ color }}>{rank}<span style={{ marginLeft: 2 }}>{glyph}</span></div>
    </div>
  );
}

function Pozo({ topCard, pileCount, dropHover, justSlammed }: {
  topCard: Card | null; pileCount: number; dropHover: boolean; justSlammed: number;
}) {
  const tier = pozoTier(pileCount);
  const tierInfo = POZO_TIERS[tier]!;
  const under = Math.min(Math.max(pileCount - 1, 0), 18);
  const spread = 8 + tier * 12;
  const rotSpread = 6 + tier * 16;
  const meterPct = Math.min(100, (pileCount / 18) * 100);
  const stack = Array.from({ length: under }, (_, i) => {
    const r = pileRandoms(i);
    return { x: (r.rx - 0.5) * spread, y: (r.ry - 0.5) * spread - i * 0.35, rot: (r.rr - 0.5) * rotSpread, i };
  });

  return (
    <div className={`pozo pozo-tier-${tier}${dropHover ? ' pozo-drop-hover' : ''}${justSlammed ? ' pozo-slammed' : ''}`}>
      <div className="pozo-aura" />
      <div className="pozo-aura pozo-aura-2" />
      <div className="pozo-drop-zone" data-pozo-drop="1" />
      <div className="pozo-stack">
        {stack.map((s) => (
          <div key={s.i} className="pozo-under"
            style={{ transform: `translate(${s.x}px,${s.y}px) rotate(${s.rot}deg)`, zIndex: s.i + 1 }}>
            <PozoUnderCard index={s.i} />
          </div>
        ))}
        <div className="pozo-top" key={`top-${justSlammed}`} style={{ zIndex: 100 }}>
          {topCard
            ? <CardFace card={topCard} size="pile" glow={tier >= 2} />
            : <div style={{ width: 104, height: 152, borderRadius: 9, border: '2px dashed rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(246,239,222,.2)', fontSize: 28 }}>—</div>
          }
        </div>
      </div>
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
                <span key={k} className={`pozo-meter-mark${k <= tier ? ' on' : ''}`}
                  style={{ left: `${Math.min(100, (tt.min / 18) * 100)}%` }} />
              ))}
            </div>
          </div>
          <div className={`pozo-tier-label pozo-tier-label-${tier}`}>{tierInfo.label}</div>
        </div>
      </div>
      {tier >= 3 && (
        <div className="pozo-sparks" aria-hidden="true">
          {Array.from({ length: tier === 4 ? 9 : 5 }).map((_, i) => (
            <span key={i} className="pozo-spark" style={{ left: `${15 + (i * 73) % 70}%`, top: `${10 + (i * 41) % 70}%`, animationDelay: `${(i * 137) % 800}ms` }} />
          ))}
        </div>
      )}
      {tier === 4 && (
        <div className="pozo-skull-warn">
          <span>☠</span><span>SE LA COME TODA</span><span>☠</span>
        </div>
      )}
    </div>
  );
}

// ─── DeckStack ────────────────────────────────────────────────────────────────

function DeckStack({ deckCount, onClick }: { deckCount: number; onClick: () => void }) {
  return (
    <button className="deck-stack" onClick={onClick} aria-label="Robar carta">
      {deckCount > 2 && <div className="deck-card deck-card-3" />}
      {deckCount > 1 && <div className="deck-card deck-card-2" />}
      {deckCount > 0
        ? <div className="deck-card deck-card-1"><div className="back-grid"><div className="back-mono">4A</div><div className="back-mono back-mono-sm">AMIGOS</div></div></div>
        : <div style={{ width: 104, height: 152, borderRadius: 9, border: '2px dashed rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(246,239,222,.2)', fontSize: 28 }}>—</div>
      }
      <div className="deck-count">{deckCount}</div>
      <div className="deck-label">MAZO</div>
    </button>
  );
}

// ─── HandFan ──────────────────────────────────────────────────────────────────

interface DragState {
  idx: number; cardId: string; card: Card;
  x: number; y: number; sx: number; sy: number;
  ox: number; oy: number;
  moved: boolean; overDrop: boolean; flickReady: boolean;
}

const MIRROR_RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function isValidUnderMirror(rank: string): boolean {
  // 2 y 10 siempre son válidos (especiales); el resto debe ser ≤ 7
  if (rank === '2' || rank === '10') return true;
  return (MIRROR_RANK_VALUES[rank] ?? 99) <= 7;
}

function HandFan({ cards, selectedIds, draggingIdx, onPointerDownCard, isMyTurn, turnConstraint }: {
  cards: Card[]; selectedIds: string[]; draggingIdx: number;
  onPointerDownCard: (idx: number, e: React.PointerEvent) => void;
  isMyTurn: boolean;
  turnConstraint: string;
}) {
  const total = cards.length;
  const mid = (total - 1) / 2;
  // Responsive card spacing — shrinks on narrow viewports
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const spacing = vw < 380 ? 26 : vw < 420 ? 30 : vw < 600 ? 38 : vw < 780 ? 44 : 52;
  const tiltPer = vw < 420 ? 2.5 : 4;
  const isMirror = turnConstraint === 'mirror' && isMyTurn;
  return (
    <div className="hand-wrap">
      <div className="hand-fan">
        {cards.map((c, i) => {
          const offset = i - mid;
          const isSel = selectedIds.includes(c.id);
          const isDragging = i === draggingIdx;
          const inactive = !isMyTurn && !isSel;
          // En constraint mirror: atenuar cartas inválidas (> 7, excepto 2 y 10)
          const mirrorInvalid = isMirror && !isSel && !isValidUnderMirror(c.rank);
          const mirrorValid = isMirror && isValidUnderMirror(c.rank) && !isSel;
          return (
            <div key={c.id}
              className={`hand-slot${isSel ? ' hand-slot-sel' : ''}${isDragging ? ' hand-slot-dragging' : ''}${inactive ? ' hand-slot-inactive' : ''}${mirrorInvalid ? ' hand-slot-mirror-invalid' : ''}${mirrorValid ? ' hand-slot-mirror-valid' : ''}`}
              style={{
                transform: `translateX(${offset * spacing}px) translateY(${Math.abs(offset) * 5 + (isSel ? -28 : 0)}px) rotate(${offset * tiltPer}deg)`,
                zIndex: isSel ? 100 : 10 + i,
              }}
              onPointerDown={(e) => onPointerDownCard(i, e)}>
              <CardFace card={c} lifted={isSel} dim={inactive || mirrorInvalid} />
            </div>
          );
        })}
      </div>
      <div className="hand-hint">
        <span className="hand-hint-arrow">↑</span>
        <span>arrastra · flick · o click + TIRAR</span>
      </div>
    </div>
  );
}

// ─── HandActions ──────────────────────────────────────────────────────────────

function HandActions({ canPlay, onPlay, onClear, onTake }: {
  canPlay: boolean; onPlay: () => void; onClear: () => void; onTake: () => void;
}) {
  return (
    <div className="hand-actions">
      {canPlay && (
        <button className="btn-ghost" onClick={onClear}>
          <span className="kbd">ESC</span><span>Soltar</span>
        </button>
      )}
      <button className={`btn-play${canPlay ? '' : ' btn-play-disabled'}`}
        onClick={onPlay} disabled={!canPlay}>
        <span>TIRAR</span><span className="btn-play-arrow">▸</span>
      </button>
      <button className="btn-ghost" onClick={onTake}>
        <span className="kbd">⤵</span><span>Robar pozo</span>
      </button>
    </div>
  );
}

// ─── Intercept overlays ───────────────────────────────────────────────────────

function InterceptBanner({ canIntercept, onIntercept }: { canIntercept: boolean; onIntercept: () => void }) {
  if (!canIntercept) return null;
  return (
    <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, letterSpacing: 4, color: '#E8FF3D', textShadow: '0 0 20px #E8FF3D' }}>INTERCEPCIÓN</div>
      <button onClick={onIntercept} style={{ background: '#E8FF3D', color: '#0e0b08', border: 'none', padding: '12px 32px', borderRadius: 999, fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, cursor: 'pointer', boxShadow: '0 0 30px rgba(232,255,61,.5), 0 0 0 3px #0e0b08' }}>ROBAR TURNO</button>
    </div>
  );
}

function InterceptFlashOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 400, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(232,255,61,.35) 0%, rgba(232,255,61,.08) 50%, transparent 75%)', animation: 'fade-in 1.3s ease-out forwards' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'Anton,sans-serif', fontSize: 52, letterSpacing: 8, color: '#E8FF3D', textShadow: '0 0 20px #E8FF3D, 0 0 50px #E8FF3D', whiteSpace: 'nowrap' }}>INTERCEPCION!</div>
    </div>
  );
}

// ─── EpicBlindReveal — overlay de la fase ciega ───────────────────────────────

function EpicBlindReveal({ visible }: { visible: boolean }) {
  // Overlay breve "¡FASE CIEGA!" que aparece al entrar a la fase
  const [show, setShow] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (visible && !shown) {
      setShow(true);
      setShown(true);
      setTimeout(() => setShow(false), 2200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!show) return null;
  return (
    <div className="blind-reveal-overlay" aria-live="assertive">
      <div className="blind-reveal-bg" />
      <div className="blind-reveal-content">
        <div className="blind-reveal-kicker">ÚLTIMA BARRERA</div>
        <div className="blind-reveal-title">¡FASE CIEGA!</div>
        <div className="blind-reveal-sub">Las cartas son un misterio — ¡buena suerte!</div>
      </div>
    </div>
  );
}

// ─── OpponentMesa ─────────────────────────────────────────────────────────────
// Mini tarjetitas (20×28 px) que muestran las cartas de mesa de un oponente.

const SUIT_COLORS_MINI: Record<string, string> = {
  oros: '#E8FF3D', copas: '#FF2244', espadas: '#9DE5FF', bastos: '#FF6A1A',
};

function OpponentMesa({ tableUp, tableDownCount }: {
  tableUp: Card[]; tableDownCount: number;
}) {
  if (tableUp.length === 0 && tableDownCount === 0) return null;
  const upSlots = [...tableUp, ...Array.from({ length: Math.max(0, 4 - tableUp.length) }, () => null)];
  return (
    <div className="opp-mesa">
      {/* Fila boca-arriba */}
      <div className="opp-mesa-row">
        {upSlots.map((card, i) =>
          card ? (
            <div key={card.id} className="opp-mesa-card opp-mesa-card-face"
              style={{ color: SUIT_COLORS_MINI[card.suit] ?? '#f5f0e8' }}>
              {card.rank}
            </div>
          ) : (
            <div key={i} className="opp-mesa-card opp-mesa-card-empty" />
          )
        )}
      </div>
      {/* Fila boca-abajo (ciegas) */}
      <div className="opp-mesa-row">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`opp-mesa-card ${i < tableDownCount ? 'opp-mesa-card-back' : 'opp-mesa-card-empty'}`} />
        ))}
      </div>
    </div>
  );
}

// ─── MirrorConstraintBanner ──────────────────────────────────────────────────

function MirrorConstraintBanner({ isMyTurn }: { isMyTurn: boolean }) {
  return (
    <div className={`mirror-banner${isMyTurn ? ' mirror-banner-my-turn' : ''}`} role="status" aria-live="polite">
      <span className="mirror-banner-icon">↓7</span>
      <span className="mirror-banner-text">
        {isMyTurn
          ? '¡Juega ≤ 7, carnal! (2 y 10 también sirven)'
          : 'El 7 está activo — el turno exige carta ≤ 7'}
      </span>
    </div>
  );
}

// ─── PlayerZone ───────────────────────────────────────────────────────────────
// Layout Opción C con collapse: solo la franja activa se expande a full size.
// Las franjas inactivas colapsan a un strip de ~34px con pip indicators.

function PlayerZone({
  self, selectedIds, onToggle, isMyTurn, onPlay, draggingIdx, onPointerDownCard, turnConstraint,
}: {
  self: SelfView; selectedIds: string[]; onToggle: (id: string) => void;
  isMyTurn: boolean; onPlay: () => void;
  draggingIdx: number; onPointerDownCard: (idx: number, e: React.PointerEvent) => void;
  turnConstraint: string;
}) {
  const inHandPhase = self.hand.length > 0;
  const inUpPhase = self.hand.length === 0 && self.tableUp.length > 0;
  const inBlindPhase = self.hand.length === 0 && self.tableUp.length === 0 && self.tableDownCount > 0;

  // ── Strip de ciegas (siempre que no sea la fase activa) ──────────────────
  const CiegasStrip = () => {
    const depleted = self.tableDownCount === 0;
    return (
      <div className={`mesa-strip-compact mesa-strip-ciegas${depleted ? ' mesa-strip-depleted' : ''}`}>
        <span className="mesa-strip-label">↓ CIEGAS</span>
        <div className="mesa-strip-pips">
          {Array.from({ length: 4 }, (_, i) => (
            i < self.tableDownCount
              ? <div key={i} className="mesa-pip-back" />
              : <div key={i} className="mesa-pip-empty" />
          ))}
        </div>
        <span style={{ marginLeft: 6, fontSize: 9, fontFamily: 'JetBrains Mono,monospace', color: 'rgba(246,239,222,.3)', letterSpacing: 1 }}>
          {self.tableDownCount}
        </span>
      </div>
    );
  };

  // ── Strip de arriba (siempre que no sea la fase activa) ──────────────────
  const ArribaStrip = () => {
    const depleted = self.tableUp.length === 0;
    // Rellenar hasta 4 slots
    const slots = [
      ...self.tableUp,
      ...Array.from({ length: Math.max(0, 4 - self.tableUp.length) }, () => null),
    ];
    return (
      <div className={`mesa-strip-compact mesa-strip-arriba${depleted ? ' mesa-strip-depleted' : ''}`}>
        <span className="mesa-strip-label">↑ ARRIBA</span>
        <div className="mesa-strip-pips">
          {slots.map((c, i) =>
            c ? (
              <div key={c.id} className="mesa-pip-face"
                style={{ color: SUIT_COLORS_MINI[c.suit] ?? '#0e0b08' }}>
                {c.rank}
              </div>
            ) : (
              <div key={i} className="mesa-pip-empty" />
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="player-zone">

      {/* ── FASE CIEGA activa: franja completa ── */}
      {inBlindPhase ? (
        <div className="mesa-franja mesa-franja-ciegas mesa-franja-phase-active">
          <span className="mesa-franja-label">↓ CIEGAS</span>
          <div className="mesa-franja-cards">
            {self.tableDown.map((cb, idx) => (
              <div
                key={cb.id}
                className={`blind-card-mystery blind-card-sm${isMyTurn ? ' blind-card-active' : ''}`}
                onClick={() => isMyTurn && onPlay()}
                style={{ animationDelay: `${idx * 0.12}s` }}
                title={isMyTurn ? '¡Toca para revelar!' : undefined}
              >
                <div className="blind-card-question">?</div>
                {isMyTurn && <div className="blind-card-pulse-ring" />}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - self.tableDown.length) }, (_, i) => (
              <div key={`e${i}`} className="mesa-slot-empty" />
            ))}
          </div>
          {isMyTurn && <span className="mesa-blind-hint">↑ TOCA</span>}
        </div>
      ) : (
        /* Strip colapsado cuando ciegas no son la fase activa */
        <CiegasStrip />
      )}

      {/* ── FASE ARRIBA activa: franja completa ── */}
      {inUpPhase ? (
        <div className="mesa-franja mesa-franja-arriba mesa-franja-phase-active">
          <span className="mesa-franja-label">↑ ARRIBA</span>
          <div className="mesa-franja-cards">
            {self.tableUp.map(c => (
              <CardFace
                key={c.id} card={c} size="small"
                selected={selectedIds.includes(c.id)}
                onClick={isMyTurn ? () => onToggle(c.id) : undefined}
              />
            ))}
            {Array.from({ length: Math.max(0, 4 - self.tableUp.length) }, (_, i) => (
              <div key={`e${i}`} className="mesa-slot-empty" />
            ))}
          </div>
        </div>
      ) : (
        /* Strip colapsado cuando arriba no es la fase activa */
        <ArribaStrip />
      )}

      {/* ── MANO: franja completa cuando es la fase activa, vacía si no ── */}
      {inHandPhase ? (
        <div className="mesa-franja mesa-franja-mano mesa-franja-phase-active">
          <HandFan
            cards={self.hand}
            selectedIds={selectedIds}
            draggingIdx={draggingIdx}
            onPointerDownCard={onPointerDownCard}
            isMyTurn={isMyTurn}
            turnConstraint={turnConstraint}
          />
        </div>
      ) : (
        <div className="mesa-franja mesa-franja-mano">
          <div className="mesa-mano-empty">—</div>
        </div>
      )}

      {/* Overlay épico al entrar a la fase ciega */}
      {inBlindPhase && <EpicBlindReveal visible />}
    </div>
  );
}

// ─── SelfReactionBar — panel de reacciones en la zona del jugador ────────────

function SelfReactionBar({ opponents, onReact }: {
  opponents: { id: string; name: string; avatarColor: string }[];
  onReact: (playerId: string, kind: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);

  // Si hay solo un oponente, se selecciona automáticamente
  const effectiveTarget = targetId ?? (opponents.length === 1 ? opponents[0]?.id ?? null : null);

  const handleReact = (key: string) => {
    if (!effectiveTarget) return;
    onReact(effectiveTarget, key);
    setOpen(false);
    setTargetId(null);
  };

  if (opponents.length === 0) return null;

  return (
    <div className="self-reaction-bar">
      {/* Tray: se abre hacia arriba */}
      {open && (
        <div className="reaction-tray">
          {/* Selector de objetivo — solo si hay más de 1 oponente */}
          {opponents.length > 1 && (
            <div className="reaction-targets">
              <div className="reaction-targets-label">¿A quién?</div>
              <div className="reaction-targets-row">
                {opponents.map(opp => (
                  <button
                    key={opp.id}
                    className={`reaction-target-btn${effectiveTarget === opp.id ? ' reaction-target-active' : ''}`}
                    onClick={() => setTargetId(prev => prev === opp.id ? null : opp.id)}
                    style={{ '--target-color': opp.avatarColor } as React.CSSProperties}
                  >
                    <div className="reaction-target-avatar" style={{ background: opp.avatarColor }}>
                      {opp.name[0]}
                    </div>
                    <span className="reaction-target-name">{opp.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Grid de reacciones */}
          <div className={`reaction-grid${!effectiveTarget ? ' reaction-grid-locked' : ''}`}>
            {REACTIONS_META.map(r => (
              <button
                key={r.key}
                className="self-react-btn"
                title={r.label}
                disabled={!effectiveTarget}
                onClick={() => handleReact(r.key)}
                aria-label={`${r.label}`}
              >
                <TwEmoji emoji={r.emoji} size={30} />
                <span className="self-react-label">{r.label}</span>
              </button>
            ))}
          </div>
          {opponents.length > 1 && !effectiveTarget && (
            <div className="reaction-pick-hint">↑ Selecciona a quién</div>
          )}
        </div>
      )}

      {/* Botón toggle */}
      <button
        className={`reaction-toggle-btn${open ? ' reaction-toggle-open' : ''}`}
        onClick={() => { setOpen(o => !o); setTargetId(null); }}
        aria-label="Panel de reacciones"
      >
        <TwEmoji emoji="💬" size={18} />
        <span>REACCIONAR</span>
        <span className="reaction-toggle-arrow">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}

// ─── InviteLobbyPanel ─────────────────────────────────────────────────────────

function InviteLobbyPanel({ roomId, players, selfName, selfColor }: {
  roomId: string; players: PlayerView[]; selfName: string; selfColor: string;
}) {
  const [copied, setCopied] = useState(false);
  const getLink = () => typeof window !== 'undefined' ? window.location.origin + window.location.pathname + '?room=' + roomId : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(getLink()); } catch { /* fallback */ }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const allP = [
    ...(selfName ? [{ name: selfName, avatarColor: selfColor, id: 'self' }] : []),
    ...players.map(p => ({ name: p.name, avatarColor: p.avatarColor, id: p.id })),
  ];
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 35, width: 'min(340px,calc(100vw - 32px))', background: 'rgba(14,11,8,.94)', border: '1px solid rgba(255,106,26,.25)', borderRadius: 14, padding: '28px 28px 24px', backdropFilter: 'blur(16px)', boxShadow: '0 16px 48px rgba(0,0,0,.7)' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono,monospace', letterSpacing: 3, color: 'rgba(246,239,222,.4)', marginBottom: 6 }}>CODIGO DE SALA</div>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 42, letterSpacing: 8, color: '#FF6A1A', textShadow: '0 0 24px rgba(255,106,26,.4)' }}>{roomId}</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono,monospace', letterSpacing: 2, color: 'rgba(246,239,222,.4)', marginBottom: 8 }}>JUGADORES ({allP.length}/4)</div>
        {Array.from({ length: 4 }).map((_, i) => {
          const p = allP[i];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: p ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)', border: p ? '1px solid rgba(255,255,255,.1)' : '1px dashed rgba(255,255,255,.08)' }}>
              {p ? (
                <>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 13, color: '#0e0b08', flexShrink: 0 }}>{p.name[0]}</div>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: '#f6efde' }}>{p.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono,monospace', color: '#22c55e', letterSpacing: 1 }}>LISTO</span>
                </>
              ) : (
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: 'rgba(246,239,222,.2)', letterSpacing: 1 }}>Esperando jugador...</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={copyLink} style={{ flex: 1, padding: '11px 8px', background: copied ? 'rgba(34,197,94,.2)' : 'rgba(255,106,26,.12)', border: '1.5px solid ' + (copied ? 'rgba(34,197,94,.5)' : 'rgba(255,106,26,.35)'), borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, color: copied ? '#22c55e' : '#FF6A1A', transition: 'all .2s' }}>
          {copied ? 'COPIADO!' : 'COPIAR LINK'}
        </button>
        <button onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent('Juega 4 Amigos conmigo! ' + getLink()), '_blank')} style={{ flex: 1, padding: '11px 8px', background: 'rgba(37,211,102,.1)', border: '1.5px solid rgba(37,211,102,.35)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, color: '#25D366', transition: 'all .2s' }}>
          WHATSAPP
        </button>
      </div>
    </div>
  );
}

// ─── GameEndScreen ────────────────────────────────────────────────────────────

function GameEndScreen() {
  const gameEnd = useGameStore(s => s.gameEnd);
  const socketId = useGameStore(s => s.socketId);
  if (!gameEnd) return null;
  const isWinner = socketId === gameEnd.winnerId;
  const isLoser = socketId === gameEnd.loserId && !isWinner;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
      <div style={{ textAlign: 'center', background: 'rgba(14,11,8,.97)', border: `1px solid ${isWinner ? 'rgba(232,255,61,.5)' : isLoser ? 'rgba(255,34,68,.5)' : 'rgba(255,106,26,.3)'}`, borderRadius: 16, padding: '48px 56px', maxWidth: 460, width: 'calc(100vw - 32px)' }}>
        {isWinner && <><div style={{ fontFamily: 'Anton,sans-serif', fontSize: 42, color: '#E8FF3D', letterSpacing: 4, textShadow: '0 0 30px #E8FF3D' }}>GANASTE</div></>}
        {isLoser && <><div style={{ fontFamily: 'Anton,sans-serif', fontSize: 42, color: '#FF2244', letterSpacing: 4 }}>SHITHEAD</div></>}
        {!isWinner && !isLoser && <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 42, color: '#FF6A1A', letterSpacing: 4 }}>FIN</div>}
        <div style={{ margin: '20px 0 24px', padding: '12px 20px', background: 'rgba(232,255,61,.07)', border: '1px solid rgba(232,255,61,.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 22, fontFamily: 'Anton,sans-serif', color: '#E8FF3D', letterSpacing: 2 }}>🥇 {gameEnd.winnerName}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => getSocket().emit('RESTART_GAME')} style={{ padding: '14px 28px', background: '#E8FF3D', border: 'none', borderRadius: 6, color: '#0e0b08', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, cursor: 'pointer' }}>REVANCHA</button>
          <button onClick={() => window.location.reload()} style={{ padding: '14px 28px', background: 'rgba(255,255,255,.06)', border: '1.5px solid rgba(255,255,255,.15)', borderRadius: 6, color: '#f6efde', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, cursor: 'pointer' }}>NUEVO LOBBY</button>
        </div>
      </div>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function Notifications() {
  const notifications = useGameStore(s => s.notifications);
  const dismiss = useGameStore(s => s.dismissNotification);
  const colors = { success: '#22c55e', error: '#FF2244', warning: '#E8FF3D', info: '#9DE5FF' };
  return (
    <div style={{ position: 'absolute', top: 60, right: 16, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {notifications.map(n => (
        <div key={n.id} onClick={() => dismiss(n.id)} style={{ background: 'rgba(14,11,8,.9)', border: `1px solid ${colors[n.type]}`, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: colors[n.type], maxWidth: 280, backdropFilter: 'blur(8px)', animation: 'slide-in .25s ease-out' }}>{n.message}</div>
      ))}
    </div>
  );
}

// ─── GAMEBOARD PRINCIPAL ──────────────────────────────────────────────────────

export function GameBoard() {
  const gameView = useGameStore(s => s.gameView);
  const socketId = useGameStore(s => s.socketId);
  const interceptActive = useGameStore(s => s.interceptActive);
  const selectedCardIds = useGameStore(s => s.selectedCardIds);
  const toggleCardSel = useGameStore(s => s.toggleCardSelection);
  const clearSel = useGameStore(s => s.clearSelection);
  const floatingReactions = useGameStore(s => s.floatingReactions);

  const { playSelected, takePile, flipBlind, startGame, isMyTurn } = usePlayCard();
  const { canIntercept, interceptTurn } = useIntercept();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const [slamPulse, setSlamPulse] = useState(0);
  const [localReactions, setLocalReactions] = useState<FloatingReact[]>([]);
  const [lastReacts, setLastReacts] = useState<Record<string, { id: number; kind: string }>>({});
  const [steal, setSteal] = useState<{ stealer: string; victim: string } | null>(null);
  const [punish, setPunish] = useState<{ victim: string; cardCount: number } | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(TURN_SECONDS);
  const [specialAnim, setSpecialAnim] = useState<SpecialKind | null>(null);
  const [gordoActive, setGordoActive] = useState(false);

  // Track previous top card to detect special card plays
  const prevTopCardId = useRef<string | null>(null);
  const specialAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track lastActivity length to detect new events
  const prevActivityLen = useRef(0);

  // Velocity tracking for flick gesture
  const velHistory = useRef<Array<{ x: number; y: number; t: number }>>([]);

  // ── Timer tick ──────────────────────────────────────────────────────────────
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

  // ── Detect special card plays (discardTopCard rank change) ───────────────────
  useEffect(() => {
    const top = gameView?.discardTopCard;
    if (!top) return;
    if (top.id === prevTopCardId.current) return;
    prevTopCardId.current = top.id;
    const kind: SpecialKind | null =
      top.rank === '10' ? 'burn' :
        top.rank === '2' ? 'reset' :
          top.rank === '7' ? 'block' :
            top.rank === 'A' ? 'ace' : null;
    if (kind) {
      if (specialAnimTimer.current) clearTimeout(specialAnimTimer.current);
      setSpecialAnim(kind);
      specialAnimTimer.current = setTimeout(() => setSpecialAnim(null), kind === 'burn' ? 1400 : 1000);
    }
  }, [gameView?.discardTopCard]);

  // ── Watch activity feed for game events → auto-trigger overlays ──────────────
  useEffect(() => {
    const items = gameView?.lastActivity;
    if (!items || items.length <= prevActivityLen.current) {
      if (items) prevActivityLen.current = items.length;
      return;
    }
    const newItems = items.slice(prevActivityLen.current);
    prevActivityLen.current = items.length;

    for (const item of newItems) {
      if (item.kind === 'burn') {
        // 4-of-a-kind burn: pile is cleared so discardTopCard becomes null
        // Trigger burn anim via activity event
        if (specialAnimTimer.current) clearTimeout(specialAnimTimer.current);
        setSpecialAnim('burn');
        specialAnimTimer.current = setTimeout(() => setSpecialAnim(null), 1400);
      } else if (item.kind === 'intercept') {
        // Auto-show steal banner: interceptor stole turn from active player
        setSteal({ stealer: item.actorName, victim: item.targetName ?? '???' });
      } else if (item.kind === 'take_pile') {
        // Gordo Glotón se activa automáticamente para TODOS cuando alguien come el pozo
        setGordoActive(true);
        // Punishment overlay solo para quien tomó el pozo
        if (item.actorId === socketId) {
          const pileCount = gameView?.discardPileCount ?? 0;
          setPunish({ victim: item.actorName, cardCount: pileCount > 0 ? pileCount : (item.cardRanks?.length ?? 1) });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameView?.lastActivity]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
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

  // ── Drag / Flick handler ────────────────────────────────────────────────────
  const handleCardPointerDown = useCallback((idx: number, e: React.PointerEvent) => {
    if (!gameView?.self) return;
    e.preventDefault();
    const card = gameView.self.hand[idx];
    if (!card) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    velHistory.current = [];
    setDrag({
      idx, cardId: card.id, card,
      x: e.clientX, y: e.clientY,
      sx: e.clientX, sy: e.clientY,
      ox: e.clientX - (rect.left + rect.width / 2),
      oy: e.clientY - (rect.top + rect.height / 2),
      moved: false, overDrop: false, flickReady: false,
    });
  }, [gameView]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      const moved = drag.moved || (dx * dx + dy * dy > 36);

      // Track velocity for flick detection
      const now = Date.now();
      velHistory.current.push({ x: e.clientX, y: e.clientY, t: now });
      if (velHistory.current.length > 10) velHistory.current.shift();

      // Dropzone hit-test
      const zone = document.querySelector('[data-pozo-drop="1"]');
      let overDrop = false;
      if (zone) {
        const r = zone.getBoundingClientRect();
        overDrop = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }

      // Flick ready: moving upward fast enough, at least 40px from start
      const flickReady = moved && dy < -40;

      setDrag(d => d ? { ...d, x: e.clientX, y: e.clientY, moved, overDrop, flickReady } : null);
    };

    const onUp = () => {
      if (!drag) return;

      // Flick detection: measure velocity over last 120ms
      const now = Date.now();
      const recent = velHistory.current.filter(p => now - p.t < 120);
      let flicked = false;
      if (recent.length >= 2) {
        const first = recent[0]!;
        const last = recent[recent.length - 1]!;
        const dt = Math.max(last.t - first.t, 1);
        const vy = (last.y - first.y) / dt; // px/ms — negative = upward
        const vx = (last.x - first.x) / dt;
        const speed = Math.sqrt(vx * vx + vy * vy);
        // Flick: upward velocity > 0.4 px/ms AND fast enough
        flicked = vy < -0.4 && speed > 0.35;
      }

      const shouldPlay = (drag.overDrop && drag.moved) || (flicked && drag.moved);
      if (shouldPlay) {
        setSlamPulse(p => p + 1);
        const store = useGameStore.getState();
        store.clearSelection();
        store.toggleCardSelection(drag.cardId);
        setTimeout(() => playSelected(), 0);
      } else if (!drag.moved) {
        toggleCardSel(drag.cardId);
      }
      setDrag(null);
      velHistory.current = [];
    };

    const onCancel = () => { setDrag(null); velHistory.current = []; };
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
      north: { x: window.innerWidth / 2, y: 160 },
      west: { x: 200, y: window.innerHeight / 2 },
      east: { x: window.innerWidth - 200, y: window.innerHeight / 2 },
    };
    const oppIdx = gameView!.opponents.indexOf(p);
    const pos = positions[POSITIONS[oppIdx % 3]!] ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const id = String(Date.now() + Math.random());
    const drift = (Math.random() - 0.5) * 80;
    setLocalReactions(rs => [...rs, { id, kind, x: pos.x, y: pos.y, drift }]);
    setLastReacts(lr => ({ ...lr, [playerId]: { id: Date.now(), kind } }));
    getSocket().emit('SEND_REACTION', { emoji: kind });
  };

  if (!gameView) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0807', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f6efde', fontFamily: 'Anton,sans-serif', fontSize: 24, letterSpacing: 4 }}>
        CARGANDO MESA...
      </div>
    );
  }

  const {
    self, opponents, phase, discardTopCard, discardPileCount, deckCount,
    lastActivity, round, roomId, currentPlayerId, turnStartedAt, turnConstraint,
  } = gameView;

  const dropHover = !!(drag && drag.overDrop && drag.moved);

  // Player order for TurnFlowRing
  const allPlayerIds = self ? [self.id, ...opponents.map(o => o.id)] : opponents.map(o => o.id);
  const playerColors: Record<string, string> = {};
  if (self) playerColors[self.id] = self.avatarColor;
  opponents.forEach(o => { playerColors[o.id] = o.avatarColor; });

  const myTurnActive = isMyTurn && phase === 'playing';

  return (
    <div className={`stage stage-patio${myTurnActive ? ' stage-my-turn' : ''}`}>
      {/* ── Environment ───────────────────────────────────── */}
      <div className="env-wood" />
      <div className="env-vignette" />
      <div className="env-lights" />
      <div className="env-neon" />
      <div className="env-grain" />
      <div className="table-disc" />
      {/* Borde de turno pulsante */}
      {myTurnActive && <div className="env-my-turn-border" aria-hidden="true" />}

      {/* ── HUD ───────────────────────────────────────────── */}
      <HudStrip round={round} roomId={roomId} phase={phase} />

      {/* ── Activity Feed ─────────────────────────────────── */}
      <ActivityFeed items={lastActivity} />

      {/* ── Turn flow ring ────────────────────────────────── */}
      {phase === 'playing' && allPlayerIds.length > 1 && (
        <TurnFlowRing
          playerOrder={allPlayerIds}
          currentPlayerId={currentPlayerId}
          playerColors={playerColors}
        />
      )}

      {/* ── Opponent corners ──────────────────────────────── */}
      {opponents.map((opp, i) => (
        <PlayerCorner key={opp.id} player={opp}
          active={currentPlayerId === opp.id}
          remaining={timerRemaining} total={TURN_SECONDS}
          position={POSITIONS[i % 3]!}
          lastReaction={lastReacts[opp.id] ?? null} />
      ))}

      {/* ── Center: deck + pozo or lobby ─────────────────── */}
      {phase === 'lobby' ? (
        <InviteLobbyPanel roomId={roomId} players={opponents}
          selfName={self?.name ?? ''} selfColor={self?.avatarColor ?? '#FF6A1A'} />
      ) : (
        <div className="center-table">
          <DeckStack deckCount={deckCount} onClick={takePile} />
          <Pozo topCard={discardTopCard} pileCount={discardPileCount}
            dropHover={dropHover} justSlammed={slamPulse} />
        </div>
      )}

      {/* Turn timer global eliminado: cada avatar muestra su propio anillo */}

      {/* ── Intercept ─────────────────────────────────────── */}
      <InterceptFlashOverlay active={interceptActive} />
      <InterceptBanner canIntercept={canIntercept} onIntercept={interceptTurn} />

      {/* ── Mirror constraint banner (7 jugado) ───────────── */}
      {turnConstraint === 'mirror' && phase === 'playing' && (
        <MirrorConstraintBanner isMyTurn={isMyTurn} />
      )}

      {/* ── Bottom bar ────────────────────────────────────── */}
      {self && (
        <div className="bottom-bar">
          <div className="me-zone">
            <PlayerCorner player={{ id: self.id, name: self.name, avatarColor: self.avatarColor }}
              active={currentPlayerId === self.id}
              remaining={timerRemaining} total={TURN_SECONDS}
              position="south" isMe />
            {currentPlayerId === self.id && phase === 'playing' && (
              <div className="me-turn-badge">
                <TimerRing remaining={timerRemaining} total={TURN_SECONDS} size={40} />
                <div className="me-turn-badge-text">
                  <div className="me-turn-badge-label">TU TURNO</div>
                  <div className="me-turn-badge-time">{Math.ceil(timerRemaining)}s restantes</div>
                </div>
              </div>
            )}
            {/* Panel de reacciones — siempre en tu zona */}
            {phase === 'playing' && opponents.length > 0 && (
              <SelfReactionBar opponents={opponents} onReact={onReact} />
            )}
          </div>

          <PlayerZone
            self={self}
            selectedIds={selectedCardIds}
            onToggle={toggleCardSel}
            isMyTurn={isMyTurn}
            onPlay={handlePlay}
            draggingIdx={drag && drag.moved ? drag.idx : -1}
            onPointerDownCard={handleCardPointerDown}
            turnConstraint={turnConstraint}
          />

          {phase === 'playing' && (
            <HandActions
              canPlay={selectedCardIds.length > 0 || (self.hand.length === 0 && self.tableUp.length === 0 && self.tableDownCount > 0)}
              onPlay={handlePlay} onClear={clearSel} onTake={takePile} />
          )}
          {phase === 'lobby' && (
            <div className="hand-actions">
              <button className="btn-play" onClick={startGame}>INICIAR PARTIDA</button>
            </div>
          )}
        </div>
      )}

      {/* ── Drag ghost ────────────────────────────────────── */}
      {drag && drag.moved && (
        <div className={`drag-ghost${drag.overDrop ? ' drag-ghost-over' : ''}`}
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy }}>
          <CardFace card={drag.card} size="hand" glow={drag.overDrop || drag.flickReady} />
          {drag.overDrop && <div className="drag-ghost-drop-cue">SOLTAR</div>}
        </div>
      )}

      {/* Drag hint: shows current mode */}
      {drag && drag.moved && !drag.overDrop && (
        <div className={`drag-hint${drag.flickReady ? ' flick-ready' : ''}`}>
          <span>{drag.flickReady ? '¡FLICK!' : 'arrástrala al'}</span>
          <span className="drag-hint-strong">{drag.flickReady ? 'SUELTA YA' : 'POZO'}</span>
        </div>
      )}

      {/* ── Reaction floaters ─────────────────────────────── */}
      {localReactions.map(r => (
        <ReactionFloater key={r.id} {...r}
          onDone={() => setLocalReactions(rs => rs.filter(x => x.id !== r.id))} />
      ))}
      {/* Store floating reactions (from other players via socket) */}
      {floatingReactions.map(r => (
        <div key={r.id} style={{ position: 'absolute', left: `${r.x}%`, bottom: '22%', animation: 'float-up 2.8s ease-out forwards', pointerEvents: 'none', zIndex: 180 }}>
          <div style={{ fontSize: 44, lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.6))' }}>{r.emoji}</div>
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono,monospace', color: r.color, textAlign: 'center' }}>{r.playerName}</div>
        </div>
      ))}

      {/* Special card animation */}
      {specialAnim && <SpecialCardAnim kind={specialAnim} />}

      {/* Steal banner */}
      {steal && <StealBanner stealer={steal.stealer} victim={steal.victim} onDone={() => setSteal(null)} />}

      {/* Punishment overlay */}
      {punish && <PunishmentOverlay victim={punish.victim} cardCount={punish.cardCount} onDismiss={() => setPunish(null)} />}

      {/* Gordo Gloton */}
      {gordoActive && <GordoGloton onDone={() => setGordoActive(false)} />}

      {/* Notifications */}
      <Notifications />

      {/* Game End */}
      <GameEndScreen />

      {/* Watermark */}
      <Watermark />
    </div>
  );
}