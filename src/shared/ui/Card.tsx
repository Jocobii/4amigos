// =============================================================================
// 4 Amigos — Componente de Carta
// Implementación pixel-fiel del diseño en cards.jsx.
// Usa las clases CSS de globals.css.
// =============================================================================

import React from 'react';
import type { Card as CardType, CardBack } from '@/src/shared/types/game';

// ─────────────────────────── Palos ───────────────────────────────────────────

const SUIT_MAP = {
  oros:    { glyph: '◆', color: '#E8FF3D' },
  copas:   { glyph: '♥', color: '#FF2244' },
  espadas: { glyph: '♠', color: '#9DE5FF' },
  bastos:  { glyph: '✦', color: '#FF6A1A' },
} as const;

const ACTION_LABEL: Partial<Record<string, string>> = {
  '2':  'RESET',
  '7':  'BLOQUEO',
  '10': 'QUEMA',
  'A':  'REINA',
};

const ACTION_RANKS = new Set(['2', '7', '10', 'A']);

const SIZE_MAP = {
  hand:  { w: 88,  h: 130 },
  pile:  { w: 104, h: 152 },
  small: { w: 62,  h: 92  },
} as const;

// ─────────────────────────── Iconos de acción ────────────────────────────────
// SVGs custom, pixel-fieles al diseño. NO usar emojis.

function ActionIcon({ rank, size = 64 }: { rank: string; size?: number }) {
  const s = size;
  if (rank === '10') {
    return (
      <svg viewBox="0 0 64 64" width={s} height={s} aria-hidden="true">
        <path d="M14 46 C 10 36, 18 32, 16 22 C 24 28, 26 18, 30 12 C 32 22, 40 22, 40 30 C 46 28, 50 36, 48 44 C 46 50, 38 54, 32 54 C 24 54, 16 52, 14 46 Z"
              fill="#FF2244" stroke="#FFD400" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M22 42 C 22 36, 28 36, 28 30 C 32 36, 36 34, 36 40 C 36 46, 30 48, 26 48 C 23 48, 22 46, 22 42 Z"
              fill="#FFD400" />
        <circle cx="32" cy="40" r="6" fill="#0E0B08"/>
        <rect x="29.5" y="42" width="1.4" height="3" fill="#0E0B08"/>
        <rect x="33.1" y="42" width="1.4" height="3" fill="#0E0B08"/>
      </svg>
    );
  }
  if (rank === '7') {
    return (
      <svg viewBox="0 0 64 64" width={s} height={s} aria-hidden="true">
        <path d="M20 18 v22 M27 12 v28 M34 12 v28 M41 16 v24" stroke="#0E0B08" strokeWidth="6" strokeLinecap="round" fill="none"/>
        <path d="M16 32 c0 14 8 22 16 22 c8 0 16 -6 16 -16 v-12 c0 -3 -4 -3 -4 0 v6 M16 32 v-4 c0 -3 4 -3 4 0"
              fill="#FF6A1A" stroke="#0E0B08" strokeWidth="3" strokeLinejoin="round"/>
        <line x1="10" y1="54" x2="54" y2="10" stroke="#FF2244" strokeWidth="5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (rank === '2') {
    return (
      <svg viewBox="0 0 64 64" width={s} height={s} aria-hidden="true">
        <path d="M14 32 a18 18 0 0 1 32 -11" stroke="#E8FF3D" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M50 32 a18 18 0 0 1 -32 11" stroke="#FF6A1A" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M44 14 l4 8 l-9 2 z" fill="#E8FF3D"/>
        <path d="M20 50 l-4 -8 l9 -2 z" fill="#FF6A1A"/>
        <circle cx="32" cy="32" r="4" fill="#FFFFFF"/>
      </svg>
    );
  }
  if (rank === 'A') {
    return (
      <svg viewBox="0 0 64 64" width={s} height={s} aria-hidden="true">
        <path d="M12 22 L 20 32 L 26 16 L 32 30 L 38 16 L 44 32 L 52 22 L 50 42 L 14 42 Z"
              fill="#E8FF3D" stroke="#0E0B08" strokeWidth="2.5" strokeLinejoin="round"/>
        <circle cx="20" cy="20" r="2.5" fill="#FF2244"/>
        <circle cx="44" cy="20" r="2.5" fill="#FF2244"/>
        <circle cx="32" cy="14" r="2.5" fill="#FF6A1A"/>
        <rect x="14" y="42" width="36" height="4" fill="#0E0B08"/>
        <circle cx="32" cy="52" r="5" fill="#FFFFFF"/>
        <rect x="29" y="51" width="2" height="3" fill="#0E0B08"/>
        <rect x="33" y="51" width="2" height="3" fill="#0E0B08"/>
      </svg>
    );
  }
  return null;
}

// ─────────────────────────── Tipos ───────────────────────────────────────────

type CardSize = 'hand' | 'pile' | 'small';

interface CardFaceProps {
  card: CardType;
  size?: CardSize;
  selected?: boolean;
  glow?: boolean;
  dim?: boolean;
  lifted?: boolean;
  rotate?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

interface CardBackProps {
  card: CardBack;
  size?: CardSize;
  rotate?: number;
  glow?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  className?: string;
}

// ─────────────────────────── CardFace ────────────────────────────────────────

export function CardFace({
  card, size = 'hand', selected = false, glow = false, dim = false,
  lifted = false, rotate = 0, onClick, style, className = '',
}: CardFaceProps) {
  const { w, h } = SIZE_MAP[size];
  const isAction = ACTION_RANKS.has(card.rank);
  const suitInfo = SUIT_MAP[card.suit as keyof typeof SUIT_MAP] ?? SUIT_MAP.oros;
  const iconSize = size === 'pile' ? 76 : 64;

  const cls = [
    'card',
    isAction ? 'card-action' : '',
    glow ? 'card-glow' : '',
    dim ? 'card-dim' : '',
    lifted || selected ? 'card-lifted' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      style={{
        width: w, height: h,
        transform: `rotate(${rotate}deg)${selected ? ' translateY(-8px)' : ''}`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      data-action={isAction ? '1' : '0'}
    >
      {/* Esquina superior izquierda */}
      <div className="card-corner card-corner-tl">
        <div className="card-rank">{card.rank}</div>
        <div className="card-suit" style={{ color: suitInfo.color }}>{suitInfo.glyph}</div>
      </div>

      {/* Centro */}
      <div className="card-center">
        {isAction ? (
          <>
            <ActionIcon rank={card.rank} size={size === 'small' ? 40 : iconSize} />
            {size !== 'small' && (
              <div className="card-action-label">{ACTION_LABEL[card.rank]}</div>
            )}
          </>
        ) : (
          <div className="card-big-suit" style={{ color: suitInfo.color, fontSize: size === 'pile' ? 52 : size === 'small' ? 32 : 48 }}>
            {suitInfo.glyph}
          </div>
        )}
      </div>

      {/* Esquina inferior derecha */}
      <div className="card-corner card-corner-br">
        <div className="card-rank">{card.rank}</div>
        <div className="card-suit" style={{ color: suitInfo.color }}>{suitInfo.glyph}</div>
      </div>

      {/* Sticker de alerta en cartas de acción */}
      {isAction && <div className="card-action-sticker" />}
    </div>
  );
}

// ─────────────────────────── CardBack ────────────────────────────────────────

export function CardBackComponent({ card, size = 'hand', rotate = 0, glow, style, onClick, className = '' }: CardBackProps) {
  const { w, h } = SIZE_MAP[size];
  const cls = ['card', 'back', glow ? 'card-glow' : '', className].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={onClick}
      style={{
        width: w, height: h,
        transform: `rotate(${rotate}deg)`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <div className="back-grid">
        <div className="back-mono">4A</div>
        <div className="back-mono back-mono-sm">AMIGOS</div>
      </div>
    </div>
  );
}

// ─────────────────────────── CardView unificado ───────────────────────────────

export function CardView({
  card, size = 'hand', selected, glow, dim, lifted, rotate, onClick, style, className,
}: {
  card: CardType | CardBack;
  size?: CardSize;
  selected?: boolean;
  glow?: boolean;
  dim?: boolean;
  lifted?: boolean;
  rotate?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  if ('faceDown' in card) {
    return (
      <CardBackComponent
        card={card} size={size} rotate={rotate} glow={glow}
        style={style} onClick={onClick} className={className}
      />
    );
  }
  return (
    <CardFace
      card={card} size={size} selected={selected} glow={glow}
      dim={dim} lifted={lifted} rotate={rotate}
      onClick={onClick} style={style} className={className}
    />
  );
}
