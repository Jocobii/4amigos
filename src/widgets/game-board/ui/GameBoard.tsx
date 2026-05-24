// =============================================================================
// 4 Amigos — Game Board Widget
// =============================================================================

'use client';

import React, { useEffect, useRef } from 'react';
import { useGameStore } from '@/src/entities/game';
import { usePlayCard } from '@/src/features/play-card/model/usePlayCard';
import { useIntercept } from '@/src/features/intercept/model/useIntercept';
import { CardFace, CardBackComponent } from '@/src/shared/ui/Card';
import { HowToPlay } from '@/src/features/how-to-play';
import { getSocket } from '@/src/shared/api/socket';
import type { Card, CardBack, PlayerView, SelfView, ActivityEvent } from '@/src/shared/types/game';

// ─────────────────────────────────────────────────────────────────────────────
// HUD Strip
// ─────────────────────────────────────────────────────────────────────────────

function HudStrip({ round, roomId, phase }: { round: number; roomId: string; phase: string }) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', zIndex: 100,
      background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Pill dot>EN VIVO &middot; MESA #{roomId}</Pill>
        <Pill ghost>RONDA {round}</Pill>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 22, color: '#FF6A1A', letterSpacing: 3 }}>4 AMIGOS</div>
        <div style={{ fontSize: 9, color: 'rgba(246,239,222,0.4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2 }}>— ROMPE AMISTADES —</div>
      </div>
      <Pill ghost>{phase === 'lobby' ? 'LOBBY' : phase === 'playing' ? 'EN JUEGO' : 'TERMINADO'}</Pill>
    </div>
  );
}

function Pill({ children, dot, ghost }: { children: React.ReactNode; dot?: boolean; ghost?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 100,
      background: ghost ? 'rgba(255,255,255,0.06)' : 'rgba(255,106,26,0.15)',
      border: `1px solid ${ghost ? 'rgba(255,255,255,0.1)' : 'rgba(255,106,26,0.3)'}`,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color: ghost ? 'rgba(246,239,222,0.6)' : '#FF6A1A', letterSpacing: 1,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF2244', boxShadow: '0 0 6px #FF2244' }} />}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Feed
// ─────────────────────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: ActivityEvent[] }) {
  return (
    <div style={{ position: 'absolute', left: 12, bottom: 200, zIndex: 50, width: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6A1A', display: 'inline-block' }} />
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2, color: 'rgba(246,239,222,0.5)' }}>EN LA MESA</span>
      </div>
      {items.slice(-5).reverse().map((item, i) => (
        <div key={item.id} style={{ marginBottom: 4, opacity: 1 - i * 0.18 }}>
          <span style={{ color: item.actorColor, fontWeight: 700, fontSize: 11 }}>{item.actorName}</span>
          <span style={{ color: 'rgba(246,239,222,0.6)', fontSize: 11 }}>
            {' '}
            {item.kind === 'play' ? `tiro ${item.cardRanks?.join(', ')}` :
             item.kind === 'take_pile' ? 'recogio el pozo' :
             item.kind === 'burn' ? 'QUEMA!' :
             item.kind === 'intercept' ? `robo el turno a ${item.targetName}` :
             item.kind === 'intercept_fail' ? 'intercepcion fallida' :
             item.kind === 'flip_blind' ? `voltea ciega: ${item.cardRanks?.[0]}` :
             item.kind}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opponent Corner
// ─────────────────────────────────────────────────────────────────────────────

function OpponentCorner({ player, isActive, position }: {
  player: PlayerView; isActive: boolean; position: 'north' | 'west' | 'east';
}) {
  const posStyle: Record<string, React.CSSProperties> = {
    north: { top: 70, left: '50%', transform: 'translateX(-50%)' },
    west:  { left: 12, top: '50%', transform: 'translateY(-50%)' },
    east:  { right: 12, top: '50%', transform: 'translateY(-50%)' },
  };

  return (
    <div style={{
      position: 'absolute', ...posStyle[position], zIndex: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      transition: 'all 0.3s ease',
    }}>
      {isActive && (
        <div style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          width: 80, height: 80, borderRadius: '50%',
          background: `radial-gradient(circle, ${player.avatarColor}55 0%, transparent 70%)`,
          animation: 'turnGlow 1s ease-in-out infinite alternate',
          zIndex: -1, pointerEvents: 'none',
        }} />
      )}
      <div style={{
        width: 52, height: 52, borderRadius: '50%', background: player.avatarColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Anton, sans-serif', fontSize: 20, color: '#0e0b08',
        boxShadow: isActive
          ? `0 0 0 3px ${player.avatarColor}, 0 0 30px ${player.avatarColor}BB, 0 0 60px ${player.avatarColor}44`
          : '0 2px 8px rgba(0,0,0,0.5)',
        border: isActive ? '3px solid #fff' : '2px solid rgba(255,255,255,0.1)',
        animation: isActive ? 'avatarPulse 1.2s ease-in-out infinite' : 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}>
        {player.name[0]}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Anton, sans-serif', fontSize: 12, letterSpacing: 1,
          color: isActive ? player.avatarColor : '#f6efde',
          textShadow: isActive ? `0 0 10px ${player.avatarColor}` : 'none',
        }}>{player.name}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(246,239,222,0.5)' }}>
          {player.handCount} cartas
        </div>
      </div>
      {player.tableUp.length > 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {player.tableUp.map(c => <CardFace key={c.id} card={c} size="small" />)}
        </div>
      )}
      {player.tableDownCount > 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {player.tableDown.map(cb => <CardBackComponent key={cb.id} card={cb} size="small" />)}
        </div>
      )}
      {isActive && (
        <div style={{
          fontFamily: 'Anton, sans-serif', fontSize: 11,
          background: player.avatarColor, color: '#0e0b08',
          padding: '4px 14px', borderRadius: 100, letterSpacing: 2,
          boxShadow: `0 0 16px ${player.avatarColor}AA`,
          animation: 'turnBadgePulse 0.8s ease-in-out infinite alternate',
          whiteSpace: 'nowrap',
        }}>SU TURNO</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Burn Fire Canvas — animacion de fuego real con canvas
// ─────────────────────────────────────────────────────────────────────────────

const BURN_DURATION_MS = 2000;

function BurnFireCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const startRef  = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startRef.current = Date.now();

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      life: number; maxLife: number; size: number;
    }
    const particles: Particle[] = [];
    const W = canvas.width;
    const H = canvas.height;
    const CX = W / 2;
    const CY = H * 0.72;

    const spawnBurst = (count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = 1.8 + Math.random() * 3.5;
        const ml = 0.55 + Math.random() * 0.45;
        particles.push({
          x: CX + (Math.random() - 0.5) * 70,
          y: CY,
          vx: Math.cos(angle) * speed * 0.4,
          vy: Math.sin(angle) * speed,
          life: ml, maxLife: ml,
          size: 7 + Math.random() * 14,
        });
      }
    };

    spawnBurst(24);
    let lastSpawn = Date.now();

    const getColor = (t: number): string => {
      // t: 0=fresh 1=dying
      if (t < 0.15) return 'rgba(255,255,240,1)';
      if (t < 0.35) return 'rgba(255,230,60,1)';
      if (t < 0.6)  return 'rgba(255,120,20,1)';
      return 'rgba(255,50,0,0.65)';
    };

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startRef.current;

      ctx.clearRect(0, 0, W, H);

      // Spawn continuous particles for first 1400ms
      if (elapsed < 1400 && now - lastSpawn > 60) {
        spawnBurst(4);
        lastSpawn = now;
      }

      // Expanding ring flash
      if (elapsed < 500) {
        const r = (elapsed / 500) * 90;
        const a = 1 - elapsed / 500;
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,140,0,${a * 0.9})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255,100,0,0.8)';
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Update + draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy -= 0.06;
        p.vx *= 0.98;
        p.life -= 0.022;
        p.size *= 0.975;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const t = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2.2);
        ctx.fillStyle = getColor(t);
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(255,90,0,0.9)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 0.65, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // QUEMA! text
      const textAlpha =
        elapsed < 350 ? elapsed / 350 :
        elapsed > 1400 ? Math.max(0, 1 - (elapsed - 1400) / 600) : 1;
      const textScale =
        elapsed < 350 ? 0.4 + (elapsed / 350) * 0.7 : 1;

      if (textAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.translate(CX, CY - 90);
        ctx.scale(textScale, textScale);
        ctx.font = 'bold 44px Anton, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff5500';
        ctx.fillText('QUEMA!', 0, 0);
        ctx.restore();
      }

      if (particles.length > 0 || elapsed < BURN_DURATION_MS) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active]);

  if (!active) return null;

  return (
    <canvas ref={canvasRef} width={260} height={320} style={{
      position: 'absolute', bottom: 0, left: '50%',
      transform: 'translateX(-50%)',
      pointerEvents: 'none', zIndex: 25,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Special Card Effect — overlay breve para 2, 7, A
// ─────────────────────────────────────────────────────────────────────────────

const SPECIAL_FX: Record<string, { label: string; color: string; glow: string }> = {
  '2':  { label: 'RESET',          color: '#9DE5FF', glow: '#9DE5FF' },
  '7':  { label: 'ESPEJO  x7',     color: '#c084fc', glow: '#a855f7' },
  'A':  { label: 'AS  —  EL MAS ALTO', color: '#fbbf24', glow: '#f59e0b' },
};

function SpecialCardEffect({ lastActivity }: { lastActivity: ActivityEvent[] }) {
  const [fx, setFx] = React.useState<{ label: string; color: string; glow: string } | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const last = lastActivity[lastActivity.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    lastIdRef.current = last.id;
    if (last.kind === 'play' && last.cardRanks) {
      const rank = last.cardRanks[0];
      if (rank && SPECIAL_FX[rank]) {
        setFx(SPECIAL_FX[rank]!);
        const t = setTimeout(() => setFx(null), 1600);
        return () => clearTimeout(t);
      }
    }
  }, [lastActivity]);

  if (!fx) return null;

  return (
    <div style={{
      position: 'absolute', top: '32%', left: '50%',
      transform: 'translate(-50%, -50%)',
      fontFamily: 'Anton, sans-serif', fontSize: 34,
      color: fx.color, letterSpacing: 6,
      textShadow: `0 0 20px ${fx.glow}, 0 0 50px ${fx.glow}`,
      animation: 'specialFxIn 1.6s ease-out forwards',
      pointerEvents: 'none', zIndex: 310, whiteSpace: 'nowrap',
    }}>
      {fx.label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Center Table
// ─────────────────────────────────────────────────────────────────────────────

function CenterTable({ topCard, deckCount, pileCount, burnActive }: {
  topCard: Card | null; deckCount: number; pileCount: number; burnActive: boolean;
}) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex', gap: 32, alignItems: 'center', zIndex: 30,
    }}>
      {/* Mazo */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 88, height: 130 }}>
          {deckCount > 2 && <div style={{ position: 'absolute', top: 4, left: 4 }}><CardBackComponent card={{ id: 'back3', faceDown: true }} size="hand" /></div>}
          {deckCount > 1 && <div style={{ position: 'absolute', top: 2, left: 2 }}><CardBackComponent card={{ id: 'back2', faceDown: true }} size="hand" /></div>}
          {deckCount > 0
            ? <div style={{ position: 'absolute', top: 0, left: 0 }}><CardBackComponent card={{ id: 'back1', faceDown: true }} size="hand" /></div>
            : <div style={{ width: 88, height: 130, borderRadius: 10, border: '2px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(246,239,222,0.15)', fontSize: 28 }}>—</div>
          }
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(246,239,222,0.5)', marginTop: 8, letterSpacing: 1 }}>
          {deckCount} MAZO
        </div>
      </div>

      {/* Pozo */}
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <BurnFireCanvas active={burnActive} />
        <div style={{
          width: 104, height: 152, borderRadius: 10,
          border: topCard ? '2px solid rgba(232,255,61,0.4)' : '2px dashed rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: topCard ? '0 0 20px rgba(232,255,61,0.2)' : 'none',
          transition: 'all 0.3s ease',
          animation: burnActive ? 'burnShake 0.12s ease-in-out infinite' : 'none',
        }}>
          {topCard ? <CardFace card={topCard} size="pile" glow /> : <span style={{ color: 'rgba(246,239,222,0.2)', fontSize: 28 }}>—</span>}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(246,239,222,0.5)', marginTop: 8, letterSpacing: 1 }}>
          {pileCount} EN MESA
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Self Hand
// ─────────────────────────────────────────────────────────────────────────────

function SelfHand({ self, selectedIds, onToggle, isMyTurn, onPlay, onTake, onStart, phase }: {
  self: SelfView; selectedIds: string[]; onToggle: (id: string) => void;
  isMyTurn: boolean; onPlay: () => void; onTake: () => void; onStart: () => void; phase: string;
}) {
  const cards = self.hand;
  const total = cards.length;
  const mid   = (total - 1) / 2;
  const isPlayingFromTableUp = total === 0 && self.tableUp.length > 0;
  const isPlayingBlind = total === 0 && self.tableUp.length === 0 && self.tableDownCount > 0;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingBottom: 16, zIndex: 50,
      borderTop: isMyTurn && phase === 'playing' ? '2px solid rgba(232,255,61,0.5)' : '2px solid transparent',
      background: isMyTurn && phase === 'playing' ? 'linear-gradient(0deg, rgba(232,255,61,0.06) 0%, transparent 100%)' : 'transparent',
      transition: 'border-color 0.4s, background 0.4s',
    }}>
      {isMyTurn && phase === 'playing' && (
        <div style={{
          position: 'absolute', top: -36, left: '50%', transform: 'translateX(-50%)',
          background: '#E8FF3D', color: '#0e0b08',
          fontFamily: 'Anton, sans-serif', fontSize: 13, letterSpacing: 3,
          padding: '5px 20px', borderRadius: 100,
          boxShadow: '0 0 20px rgba(232,255,61,0.6)',
          animation: 'myTurnPulse 0.9s ease-in-out infinite alternate',
          whiteSpace: 'nowrap', zIndex: 60,
        }}>TU TURNO</div>
      )}

      {isPlayingFromTableUp && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {self.tableUp.map(c => (
            <CardFace key={c.id} card={c} size="hand"
              selected={selectedIds.includes(c.id)}
              onClick={() => isMyTurn && onToggle(c.id)}
              dim={!isMyTurn} />
          ))}
        </div>
      )}

      {isPlayingBlind && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {self.tableDown.map(cb => (
            <CardBackComponent key={cb.id} card={cb} size="hand"
              onClick={() => isMyTurn && onPlay()} />
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{ position: 'relative', height: 160, width: total * 64, marginBottom: 8 }}>
          {cards.map((card, i) => {
            const offset = i - mid;
            const rot = offset * 3.5;
            const yLift = Math.abs(offset) * 5;
            const isSel = selectedIds.includes(card.id);
            return (
              <div key={card.id} style={{
                position: 'absolute', left: '50%',
                transform: `translateX(calc(-50% + ${offset * 52}px)) translateY(${yLift + (isSel ? -24 : 0)}px) rotate(${rot}deg)`,
                zIndex: isSel ? 100 : 10 + i,
                transition: 'transform 0.15s ease',
              }}>
                <CardFace card={card} size="hand" selected={isSel}
                  onClick={() => onToggle(card.id)} dim={!isMyTurn} />
              </div>
            );
          })}
        </div>
      )}

      {(self.tableUp.length > 0 && total > 0) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {self.tableUp.map(c => <CardFace key={c.id} card={c} size="small" />)}
          {self.tableDown.map(cb => <CardBackComponent key={cb.id} card={cb} size="small" />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {phase === 'lobby' && (
          <button onClick={onStart} style={btnStyle('#E8FF3D', '#0e0b08')}>INICIAR PARTIDA</button>
        )}
        {phase === 'playing' && (
          <>
            <button onClick={onTake} style={btnStyle('rgba(255,255,255,0.08)', '#f6efde', true)}>ROBAR POZO</button>
            <button onClick={onPlay}
              disabled={selectedIds.length === 0 && !isPlayingBlind}
              style={btnStyle(
                selectedIds.length > 0 || isPlayingBlind ? '#FF6A1A' : 'rgba(255,106,26,0.2)',
                selectedIds.length > 0 || isPlayingBlind ? '#0e0b08' : 'rgba(246,239,222,0.3)'
              )}>
              TIRAR
            </button>
          </>
        )}
      </div>

      {!isMyTurn && phase === 'playing' && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(246,239,222,0.4)', marginTop: 6, letterSpacing: 1 }}>
          ESPERANDO TU TURNO...
        </div>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string, ghost = false): React.CSSProperties {
  return {
    padding: '10px 22px', background: bg,
    border: ghost ? '1.5px solid rgba(255,255,255,0.15)' : 'none',
    borderRadius: 6, color,
    fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: 2,
    cursor: 'pointer', transition: 'transform 0.1s, background 0.15s',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercept Banner
// ─────────────────────────────────────────────────────────────────────────────

function InterceptBanner({ canIntercept, interceptFlash, onIntercept }: {
  canIntercept: boolean; interceptFlash: boolean; onIntercept: () => void;
}) {
  if (!canIntercept) return null;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, marginTop: -80,
    }}>
      <div style={{
        fontFamily: 'Anton, sans-serif', fontSize: 24, letterSpacing: 4,
        color: '#E8FF3D', textShadow: '0 0 20px #E8FF3D',
        animation: 'pulse 1s ease-in-out infinite',
      }}>INTERCEPCION</div>
      <button onClick={onIntercept} style={{
        ...btnStyle('#E8FF3D', '#0e0b08'),
        pointerEvents: 'all', fontSize: 18, padding: '12px 32px',
        boxShadow: '0 0 30px rgba(232,255,61,0.5)',
      }}>ROBAR TURNO</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intercept Flash — rayo SVG + texto dramatico
// ─────────────────────────────────────────────────────────────────────────────

function InterceptFlashOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 400, pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(232,255,61,0.35) 0%, rgba(232,255,61,0.08) 50%, transparent 75%)',
      animation: 'interceptFlashAnim 1.3s ease-out forwards',
    }}>
      {/* SVG lightning bolt */}
      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.9, animation: 'interceptFlashAnim 0.9s ease-out forwards',
      }} viewBox="0 0 400 700" preserveAspectRatio="xMidYMid meet">
        <polyline
          points="210,30 185,220 215,220 175,430 208,430 155,680"
          fill="none" stroke="rgba(232,255,61,1)" strokeWidth="4" strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 12px #E8FF3D) drop-shadow(0 0 4px #fff)' }}
        />
        <polyline
          points="195,60 220,230 192,230 228,440 200,440 245,680"
          fill="none" stroke="rgba(255,220,80,0.5)" strokeWidth="2"
          style={{ filter: 'drop-shadow(0 0 6px #E8FF3D)' }}
        />
      </svg>

      {/* Text */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontFamily: 'Anton, sans-serif', fontSize: 52, letterSpacing: 8,
        color: '#E8FF3D',
        textShadow: '0 0 20px #E8FF3D, 0 0 50px #E8FF3D, 0 0 90px rgba(232,255,61,0.4)',
        animation: 'interceptTextAnim 1.3s ease-out forwards',
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
          animation: 'slideInRight 0.25s ease-out',
        }}>{n.message}</div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating Emoji Reactions
// ─────────────────────────────────────────────────────────────────────────────

function FloatingEmoji({ emoji, playerName, color, x }: {
  emoji: string; playerName: string; color: string; x: number;
}) {
  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      bottom: '22%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      animation: 'floatUp 2.8s ease-out forwards',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 44, lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}>
        {emoji}
      </div>
      <div style={{
        fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1,
        color, textShadow: `0 0 8px ${color}`,
        background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4,
      }}>
        {playerName}
      </div>
    </div>
  );
}

function FloatingReactionsOverlay() {
  const reactions = useGameStore(s => s.floatingReactions);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 180, overflow: 'hidden' }}>
      {reactions.map(r => (
        <FloatingEmoji key={r.id} emoji={r.emoji} playerName={r.playerName} color={r.color} x={r.x} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaction Panel — emojis reales
// ─────────────────────────────────────────────────────────────────────────────

const REACTION_LIST = [
  '😂', '💀', '🍅', '😡', '🤡',
  '🔥', '👀', '😎', '🤯', '😈',
  '💩', '👏', '😱', '🫡', '💅',
  '🤦', '😭', '🥵', '👌', '🪵',
];

function ReactionPanel() {
  const gameView = useGameStore(s => s.gameView);
  const [open, setOpen] = React.useState(false);

  if (!gameView || gameView.phase !== 'playing') return null;

  const sendReaction = (emoji: string) => {
    getSocket().emit('SEND_REACTION', { emoji });
    setOpen(false);
  };

  return (
    <div style={{ position: 'absolute', bottom: 170, right: 16, zIndex: 150 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          background: 'rgba(14,11,8,0.97)', border: '1px solid rgba(255,106,26,0.35)',
          borderRadius: 14, padding: '12px 10px',
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
          backdropFilter: 'blur(12px)', boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          animation: 'scaleIn 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}>
          {REACTION_LIST.map(r => (
            <button key={r} onClick={() => sendReaction(r)} style={{
              width: 46, height: 46, borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              fontSize: 26, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.1s, background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,106,26,0.2)'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >{r}</button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{
        width: 46, height: 46, borderRadius: '50%',
        background: open ? 'rgba(255,106,26,0.35)' : 'rgba(255,106,26,0.12)',
        border: `1.5px solid rgba(255,106,26,${open ? '0.8' : '0.45'})`,
        fontSize: 24, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: open ? '0 0 20px rgba(255,106,26,0.5)' : 'none',
        transition: 'all 0.2s',
      }}>
        {open ? '✕' : '😀'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn Timer — 15 segundos
// ─────────────────────────────────────────────────────────────────────────────

const TURN_SECONDS = 15;

function TurnTimer({ turnStartedAt, currentPlayerId, myId, onTimeout, phase }: {
  turnStartedAt: number; currentPlayerId: string;
  myId: string | null; onTimeout: () => void; phase: string;
}) {
  const [remaining, setRemaining] = React.useState(TURN_SECONDS);
  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    if (phase !== 'playing' || !turnStartedAt) return;
    timeoutFiredRef.current = false;

    const update = () => {
      const elapsed = (Date.now() - turnStartedAt) / 1000;
      const rem = Math.max(0, TURN_SECONDS - elapsed);
      setRemaining(rem);
      if (rem <= 0 && !timeoutFiredRef.current && currentPlayerId === myId) {
        timeoutFiredRef.current = true;
        onTimeout();
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [turnStartedAt, currentPlayerId, myId, onTimeout, phase]);

  if (phase !== 'playing' || !turnStartedAt) return null;

  const pct        = remaining / TURN_SECONDS;
  const isMyTurn   = currentPlayerId === myId;
  const isUrgent   = remaining <= 4;
  const color      = isUrgent ? '#FF2244' : remaining <= 7 ? '#E8FF3D' : '#22c55e';
  const radius     = 22;
  const circ       = 2 * Math.PI * radius;

  return (
    <div style={{
      position: 'absolute', top: '50%', right: 20,
      transform: 'translateY(-50%)', zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={radius} fill="rgba(14,11,8,0.85)" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <circle
          cx={28} cy={28} r={radius} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s', filter: isUrgent ? `drop-shadow(0 0 6px ${color})` : 'none' }}
        />
        <text x={28} y={33} textAnchor="middle" fill={color}
          fontSize={isUrgent ? 17 : 15} fontFamily="Anton, sans-serif">
          {Math.ceil(remaining)}
        </text>
      </svg>
      <div style={{
        fontSize: 8, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1,
        color: isMyTurn ? color : 'rgba(246,239,222,0.3)',
        animation: isUrgent && isMyTurn ? 'pulse 0.4s ease-in-out infinite' : 'none',
      }}>
        {isMyTurn ? 'JUEGA!' : 'TURNO'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game End Screen
// ─────────────────────────────────────────────────────────────────────────────

function GameEndScreen() {
  const gameEnd  = useGameStore(s => s.gameEnd);
  const socketId = useGameStore(s => s.socketId);
  if (!gameEnd) return null;

  const isWinner = socketId === gameEnd.winnerId;
  const isLoser  = socketId === gameEnd.loserId && !isWinner;

  const rankLabel = (rank: number) =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '💩';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(10px)', animation: 'fadeIn 0.5s ease-out',
    }}>
      <div style={{
        textAlign: 'center',
        background: 'rgba(14,11,8,0.97)',
        border: `1px solid ${isWinner ? 'rgba(232,255,61,0.5)' : isLoser ? 'rgba(255,34,68,0.5)' : 'rgba(255,106,26,0.3)'}`,
        borderRadius: 16, padding: '48px 56px',
        boxShadow: isWinner ? '0 0 60px rgba(232,255,61,0.2)' : '0 20px 60px rgba(0,0,0,0.8)',
        animation: 'scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        maxWidth: 460, width: '100%',
      }}>
        {isWinner && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 56, marginBottom: 4 }}>🏆</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#E8FF3D', letterSpacing: 4, textShadow: '0 0 30px #E8FF3D', animation: 'bounce 0.6s ease infinite alternate' }}>
              GANASTE
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>
              Primero en salir. Eres el amo.
            </div>
          </div>
        )}
        {isLoser && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 52, marginBottom: 4 }}>💩</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#FF2244', letterSpacing: 4 }}>SHITHEAD</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>
              {gameEnd.loserName} es el shithead de la noche.
            </div>
          </div>
        )}
        {!isWinner && !isLoser && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 42, color: '#FF6A1A', letterSpacing: 4 }}>FIN</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'rgba(246,239,222,0.6)', marginTop: 6 }}>
              {gameEnd.loserName} es el shithead de la noche.
            </div>
          </div>
        )}

        <div style={{
          marginTop: 20, marginBottom: 24, padding: '12px 20px',
          background: 'rgba(232,255,61,0.07)', border: '1px solid rgba(232,255,61,0.2)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2, color: 'rgba(246,239,222,0.4)', marginBottom: 4 }}>GANADOR</div>
          <div style={{ fontSize: 22, fontFamily: 'Anton, sans-serif', color: '#E8FF3D', letterSpacing: 2 }}>
            🥇 {gameEnd.winnerName}
          </div>
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
              <span style={{ fontSize: 18 }}>{rankLabel(p.rank)}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              <span style={{ opacity: 0.5 }}>#{p.rank}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => getSocket().emit('RESTART_GAME')} style={{ ...btnStyle('#E8FF3D', '#0e0b08'), fontSize: 16, padding: '14px 28px', boxShadow: '0 0 20px rgba(232,255,61,0.3)' }}>
            REVANCHA
          </button>
          <button onClick={() => window.location.reload()} style={{ ...btnStyle('rgba(255,255,255,0.06)', '#f6efde', true), fontSize: 16, padding: '14px 28px' }}>
            NUEVO LOBBY
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GameBoard principal
// ─────────────────────────────────────────────────────────────────────────────

const POSITIONS: Array<'north' | 'west' | 'east'> = ['north', 'west', 'east'];

export function GameBoard() {
  const gameView          = useGameStore(s => s.gameView);
  const socketId          = useGameStore(s => s.socketId);
  const interceptFlash    = useGameStore(s => s.interceptFlash);
  const burnActive        = useGameStore(s => s.burnActive);
  const interceptActive   = useGameStore(s => s.interceptActive);
  const selectedCardIds   = useGameStore(s => s.selectedCardIds);
  const toggleCardSelection = useGameStore(s => s.toggleCardSelection);

  const { playSelected, takePile, flipBlind, startGame, isMyTurn } = usePlayCard();
  const { canIntercept, interceptTurn } = useIntercept();

  if (!gameView) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0807',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#f6efde', fontFamily: 'Anton, sans-serif', fontSize: 24, letterSpacing: 4,
      }}>
        CARGANDO MESA...
      </div>
    );
  }

  const { self, opponents, phase, discardTopCard, discardPileCount, deckCount,
          lastActivity, round, roomId, turnStartedAt } = gameView;

  const handlePlay = () => {
    if (self && self.hand.length === 0 && self.tableUp.length === 0 && self.tableDownCount > 0) {
      const firstBlind = self.tableDown[0];
      if (firstBlind) flipBlind(firstBlind.id);
    } else {
      playSelected();
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #3a2818 0%, #1c1209 60%, #0a0604 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Textura */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.12,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='.6'/></svg>")`,
        mixBlendMode: 'overlay',
      }} />
      {/* Viñeta */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.85) 100%)',
      }} />

      <HudStrip round={round} roomId={roomId} phase={phase} />

      {opponents.map((opp, i) => (
        <OpponentCorner key={opp.id} player={opp}
          isActive={gameView.currentPlayerId === opp.id}
          position={POSITIONS[i % 3]!} />
      ))}

      <CenterTable topCard={discardTopCard} deckCount={deckCount} pileCount={discardPileCount} burnActive={burnActive} />

      <SpecialCardEffect lastActivity={lastActivity} />

      <InterceptFlashOverlay active={interceptActive} />
      <InterceptBanner canIntercept={canIntercept} interceptFlash={interceptFlash} onIntercept={interceptTurn} />

      {self && (
        <SelfHand self={self} selectedIds={selectedCardIds} onToggle={toggleCardSelection}
          isMyTurn={isMyTurn} onPlay={handlePlay} onTake={takePile}
          onStart={startGame} phase={phase} />
      )}

      <TurnTimer turnStartedAt={turnStartedAt} currentPlayerId={gameView.currentPlayerId}
        myId={socketId} phase={phase} onTimeout={takePile} />

      <ActivityFeed items={lastActivity} />
      <FloatingReactionsOverlay />
      <Notifications />
      <ReactionPanel />
      <HowToPlay />
      <GameEndScreen />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes turnGlow { from { opacity: 0.4; transform: translateX(-50%) scale(0.9); } to { opacity: 1; transform: translateX(-50%) scale(1.1); } }
        @keyframes avatarPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
        @keyframes turnBadgePulse { from { box-shadow: 0 0 8px currentColor; } to { box-shadow: 0 0 24px currentColor; } }
        @keyframes myTurnPulse { from { box-shadow: 0 0 10px rgba(232,255,61,0.4); } to { box-shadow: 0 0 30px rgba(232,255,61,0.9); } }
        @keyframes burnShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px) rotate(-1deg); } 75% { transform: translateX(4px) rotate(1deg); } }
        @keyframes interceptFlashAnim { 0% { opacity: 1; } 60% { opacity: 0.7; } 100% { opacity: 0; } }
        @keyframes interceptTextAnim { 0% { transform: translate(-50%,-50%) scale(0.4); opacity: 0; } 18% { transform: translate(-50%,-50%) scale(1.18); opacity: 1; } 65% { transform: translate(-50%,-50%) scale(1); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(0.95); opacity: 0; } }
        @keyframes specialFxIn { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.4); } 20% { opacity: 1; transform: translate(-50%,-50%) scale(1.2); } 65% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(0.9); } }
        @keyframes floatUp { 0% { transform: translateY(0) scale(0.4); opacity: 0; } 12% { transform: translateY(-16px) scale(1.3); opacity: 1; } 70% { transform: translateY(-160px) scale(1); opacity: 1; } 100% { transform: translateY(-240px) scale(0.7); opacity: 0; } }
        @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-8px); } }
      `}</style>
    </div>
  );
}
