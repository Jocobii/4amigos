// =============================================================================
// 4 Amigos — Componente de Carta
// Puerto TypeScript del diseño original (cards.jsx).
// Soporta: carta de frente, carta de espaldas, tamaños: hand | pile | small
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

// ─────────────────────────── Iconos de acción ─────────────────────────────────

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

// ─────────────────────────── Carta boca abajo ─────────────────────────────────

function CardBackFace({ w, h, rotate = 0, style }: {
  w: number; h: number; rotate?: number; style?: React.CSSProperties;
}) {
  return (
    <div
      className="card-back"
      style={{
        width: w, height: h,
        transform: `rotate(${rotate}deg)`,
        borderRadius: 8,
        background: 'linear-gradient(135deg, #1a1208 0%, #2a1d12 100%)',
        border: '1.5px solid rgba(255,106,26,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      <span style={{ fontFamily: 'Anton, sans-serif', fontSize: Math.max(w * 0.22, 10), color: '#FF6A1A', letterSpacing: 1 }}>4A</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: Math.max(w * 0.09, 7), color: 'rgba(255,106,26,0.5)', letterSpacing: 2 }}>AMIGOS</span>
    </div>
  );
}

// ─────────────────────────── Componente principal ─────────────────────────────

type CardSize = 'hand' | 'pile' | 'small';

interface CardFaceProps {
  card: CardType;
  size?: CardSize;
  selected?: boolean;
  glow?: boolean;
  dim?: boolean;
  rotate?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

interface CardBackProps {
  card: CardBack;
  size?: CardSize;
  rotate?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  className?: string;
}

export function CardFace({
  card, size = 'hand', selected = false, glow = false, dim = false,
  rotate = 0, onClick, style, className = '',
}: CardFaceProps) {
  const { w, h } = SIZE_MAP[size];
  const isAction = ACTION_RANKS.has(card.rank);
  const suitInfo = SUIT_MAP[card.suit];
  const iconSize = size === 'pile' ? 76 : 54;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={className}
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: isAction ? '#0e0b08' : '#f6efde',
        border: selected
          ? '2.5px solid #FF6A1A'
          : glow
            ? '2px solid rgba(232,255,61,0.6)'
            : '1.5px solid rgba(0,0,0,0.15)',
        boxShadow: selected
          ? '0 0 16px rgba(255,106,26,0.7), 0 4px 12px rgba(0,0,0,0.5)'
          : glow
            ? '0 0 12px rgba(232,255,61,0.4), 0 3px 8px rgba(0,0,0,0.4)'
            : '0 2px 8px rgba(0,0,0,0.35)',
        transform: `rotate(${rotate}deg) ${selected ? 'translateY(-8px)' : ''}`,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        opacity: dim ? 0.45 : 1,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 5px',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Esquina superior izquierda */}
      <div style={{ alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontWeight: 700, fontSize: size === 'small' ? 11 : 14, color: isAction ? '#f6efde' : '#0e0b08', fontFamily: 'JetBrains Mono, monospace' }}>
          {card.rank}
        </span>
        <span style={{ fontSize: size === 'small' ? 9 : 11, color: suitInfo.color }}>
          {suitInfo.glyph}
        </span>
      </div>

      {/* Centro */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {isAction ? (
          <>
            <ActionIcon rank={card.rank} size={iconSize} />
            {size !== 'small' && (
              <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 9, color: '#FF6A1A', letterSpacing: 2 }}>
                {ACTION_LABEL[card.rank]}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: size === 'pile' ? 44 : size === 'hand' ? 36 : 24, color: suitInfo.color }}>
            {suitInfo.glyph}
          </span>
        )}
      </div>

      {/* Esquina inferior derecha */}
      <div style={{ alignSelf: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1, transform: 'rotate(180deg)' }}>
        <span style={{ fontWeight: 700, fontSize: size === 'small' ? 11 : 14, color: isAction ? '#f6efde' : '#0e0b08', fontFamily: 'JetBrains Mono, monospace' }}>
          {card.rank}
        </span>
        <span style={{ fontSize: size === 'small' ? 9 : 11, color: suitInfo.color }}>
          {suitInfo.glyph}
        </span>
      </div>

      {/* Sticker de carta de acción */}
      {isAction && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          width: 8, height: 8, borderRadius: '50%',
          background: suitInfo.color,
          boxShadow: `0 0 6px ${suitInfo.color}`,
        }} />
      )}
    </div>
  );
}

export function CardBackComponent({ card, size = 'hand', rotate, style, onClick, className }: CardBackProps) {
  const { w, h } = SIZE_MAP[size];
  return (
    <div onClick={onClick} className={className} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <CardBackFace w={w} h={h} rotate={rotate} style={style} />
    </div>
  );
}

/** Componente unificado: acepta Card o CardBack */
export function CardView({
  card,
  size = 'hand',
  selected,
  glow,
  dim,
  rotate,
  onClick,
  style,
  className,
}: {
  card: CardType | import('@/src/shared/types/game').CardBack;
  size?: CardSize;
  selected?: boolean;
  glow?: boolean;
  dim?: boolean;
  rotate?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  if ('faceDown' in card) {
    return <CardBackComponent card={card} size={size} rotate={rotate} style={style} onClick={onClick} className={className} />;
  }
  return (
    <CardFace
      card={card} size={size} selected={selected} glow={glow}
      dim={dim} rotate={rotate} onClick={onClick} style={style} className={className}
    />
  );
}
