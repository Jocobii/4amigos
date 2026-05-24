'use client';

// =============================================================================
// 4 Amigos — Modal "Cómo Jugar"
// 4 pasos navegables con visuales de cartas. Accesible desde el lobby.
// =============================================================================

import React, { useState, useCallback, useEffect } from 'react';

// ─────────────────────────── Componente Carta ────────────────────────────────

type CardColor = 'black' | 'red' | 'special';

function MiniCard({
  rank,
  suit,
  color = 'black',
  faceDown = false,
  size = 'md',
}: {
  rank?: string;
  suit?: string;
  color?: CardColor;
  faceDown?: boolean;
  size?: 'sm' | 'md';
}) {
  const w = size === 'sm' ? 34 : 46;
  const h = size === 'sm' ? 46 : 64;
  const fs = size === 'sm' ? 13 : 16;

  if (faceDown) {
    return (
      <div style={{
        width: w, height: h, borderRadius: 6,
        background: '#1c1209',
        border: '2px solid rgba(255,106,26,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs + 4, color: 'rgba(255,106,26,0.4)', flexShrink: 0,
      }}>?</div>
    );
  }

  const bg = color === 'special' ? '#FF6A1A' : '#f6efde';
  const textColor = color === 'special' ? '#130e0a' : (color === 'red' ? '#E82244' : '#1a1208');

  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: bg,
      border: `2px solid ${color === 'special' ? '#FF6A1A' : '#ccc'}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: textColor, flexShrink: 0, position: 'relative',
    }}>
      {suit && (
        <span style={{ fontSize: 10, position: 'absolute', top: 3, left: 5 }}>{suit}</span>
      )}
      <span style={{ fontSize: fs, fontWeight: 700 }}>{rank}</span>
    </div>
  );
}

// ─────────────────────────── Pasos ───────────────────────────────────────────

const STEPS = ['Tu mesa', 'Cómo jugar', 'Cartas especiales', 'Intercepción'];

// ── Paso 1: Tu mesa ──────────────────────────────────────────────────────────

function Step1() {
  return (
    <div>
      <p style={styles.bigTitle}>Así empieza cada partida</p>
      <p style={styles.sub}>Cada jugador tiene 3 filas de 4 cartas</p>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {/* Visualización de las 3 filas */}
        <div>
          {/* Fila ciegas */}
          <div style={{ ...styles.cardRow, marginBottom: 4 }}>
            {[0,1,2,3].map(i => <MiniCard key={i} faceDown />)}
          </div>
          {/* Fila mesa (encima de las ciegas) */}
          <div style={{ ...styles.cardRow, marginTop: -40, marginLeft: 3, marginBottom: 4 }}>
            <MiniCard rank="J" suit="♠" />
            <MiniCard rank="9" suit="♥" color="red" />
            <MiniCard rank="K" suit="♣" />
            <MiniCard rank="A" suit="◆" color="red" />
          </div>
          {/* Fila mano */}
          <div style={{ ...styles.cardRow, marginTop: 6 }}>
            <MiniCard rank="5" suit="♠" />
            <MiniCard rank="7" suit="♥" color="red" />
            <MiniCard rank="3" suit="♣" />
            <MiniCard rank="Q" suit="◆" color="red" />
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ flex: 1, paddingTop: 4 }}>
          {[
            { icon: '🔻', label: 'Ciegas', desc: 'Boca abajo. Las usas al último.' },
            { icon: '▪', label: 'Mesa', desc: 'Boca arriba. Todos las ven.' },
            { icon: '🃏', label: 'Mano', desc: 'Solo tú las ves.' },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <div style={{ fontSize: 12, color: 'rgba(246,239,222,0.6)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                <strong style={{ color: '#f6efde' }}>{label}</strong> — {desc}
              </div>
            </div>
          ))}

          <div style={styles.infoBox}>
            Objetivo: quedarte sin cartas primero.<br />
            El último = el shithead 💀
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Paso 2: Cómo jugar ────────────────────────────────────────────────────────

function Step2() {
  return (
    <div>
      <p style={styles.bigTitle}>¿Cómo se juega?</p>
      <p style={styles.sub}>Tira una carta igual o más alta que la del pozo</p>

      {/* Ejemplo válido */}
      <div style={{ ...styles.exampleRow, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <MiniCard rank="8" suit="♥" color="red" size="sm" />
          <p style={styles.cardLabel}>Pozo</p>
        </div>
        <span style={styles.arrow}>→</span>
        <div style={{ textAlign: 'center' }}>
          <MiniCard rank="J" suit="♣" size="sm" />
          <p style={styles.cardLabel}>Tiras</p>
        </div>
        <span style={styles.arrow}>→</span>
        <span style={styles.verdictOk}>✓ Válido</span>
      </div>

      {/* Ejemplo inválido */}
      <div style={{ ...styles.exampleRow, marginBottom: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <MiniCard rank="8" suit="♥" color="red" size="sm" />
          <p style={styles.cardLabel}>Pozo</p>
        </div>
        <span style={styles.arrow}>→</span>
        <div style={{ textAlign: 'center' }}>
          <MiniCard rank="4" suit="♣" size="sm" />
          <p style={styles.cardLabel}>Intentas</p>
        </div>
        <span style={styles.arrow}>→</span>
        <span style={styles.verdictNo}>✗ Recoges el pozo</span>
      </div>

      <div style={styles.infoBox}>
        Puedes tirar varias cartas del <strong style={{ color: '#f6efde' }}>mismo número</strong> a la vez.<br />
        Mientras haya mazo, rellenas tu mano hasta 4 cartas tras cada jugada.
      </div>
    </div>
  );
}

// ── Paso 3: Cartas especiales ─────────────────────────────────────────────────

const SPECIALS = [
  { rank: '2',  effect: 'Reset',      desc: 'Se juega sobre cualquier carta. El pozo vuelve a 2.' },
  { rank: '7',  effect: 'Espejo',     desc: 'El siguiente debe tirar 7 o menos (o un 2).' },
  { rank: '10', effect: 'Quemar 🔥',  desc: 'Elimina el pozo. Tiras de nuevo.' },
  { rank: 'A',  effect: 'La más alta', desc: 'Solo lo supera otro As, un 2 o un 10.' },
];

function Step3() {
  return (
    <div>
      <p style={styles.bigTitle}>Cartas especiales</p>
      <p style={styles.sub}>Estas cartas rompen las reglas normales</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SPECIALS.map(({ rank, effect, desc }) => (
          <div key={rank} style={styles.specialCard}>
            <MiniCard rank={rank} color="special" size="sm" />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#f6efde', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace', margin: 0 }}>
                {effect}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(246,239,222,0.5)', margin: '3px 0 0', lineHeight: 1.5 }}>
                {desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...styles.infoBox, marginTop: 12 }}>
        4 cartas iguales seguidas en el pozo → también quema 🔥
      </div>
    </div>
  );
}

// ── Paso 4: Intercepción ──────────────────────────────────────────────────────

function Step4() {
  return (
    <div>
      <p style={styles.bigTitle}>Intercepción</p>
      <p style={styles.sub}>La mecánica que convierte el juego en caos</p>

      <div style={{
        background: 'rgba(255,106,26,0.08)',
        border: '1px solid rgba(255,106,26,0.3)',
        borderRadius: 10,
        padding: '14px 16px',
        textAlign: 'center',
        marginBottom: 16,
      }}>
        <p style={{ color: '#FF6A1A', fontSize: 13, fontWeight: 600, fontFamily: 'monospace', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 8px' }}>
          ⚡ Roba el turno
        </p>
        <p style={{ fontSize: 12, color: 'rgba(246,239,222,0.65)', lineHeight: 1.7, margin: 0 }}>
          Si hay un <strong style={{ color: '#FF6A1A' }}>5</strong> en el pozo y el jugador actual tarda...<br />
          cualquiera con un <strong style={{ color: '#FF6A1A' }}>5</strong> en la mano puede presionar <strong style={{ color: '#FF6A1A' }}>INTERCEPTAR</strong>.<br />
          El servidor da el turno al <strong style={{ color: '#f6efde' }}>primero en responder</strong>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, fontFamily: 'monospace' }}>
        <div style={{ padding: '10px 12px', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)', borderRadius: 8, color: 'rgba(246,239,222,0.7)', lineHeight: 1.8 }}>
          ✓ Tienes un 5<br />
          ✓ No es tu turno<br />
          ✓ Ventana abierta<br />
          <strong style={{ color: '#3dd68c' }}>→ Puedes interceptar</strong>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.25)', borderRadius: 8, color: 'rgba(246,239,222,0.7)', lineHeight: 1.8 }}>
          ✗ No tienes un 5<br />
          ✗ Es tu turno<br />
          ✗ Ventana cerrada<br />
          <strong style={{ color: '#f87171' }}>→ Recoges el pozo</strong>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Modal principal ─────────────────────────────────

export function HowToPlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const close = useCallback(() => { setOpen(false); setStep(0); }, []);
  const prev  = () => setStep(s => Math.max(0, s - 1));
  const next  = () => step < STEPS.length - 1 ? setStep(s => s + 1) : close();

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  return (
    <>
      {/* Botón ? */}
      <button
        onClick={() => setOpen(true)}
        title="Cómo jugar"
        aria-label="Abrir guía de juego"
        style={{
          position: 'absolute', bottom: 16, right: 16,
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,106,26,0.12)',
          border: '1.5px solid rgba(255,106,26,0.35)',
          color: 'rgba(255,106,26,0.8)',
          fontSize: 15, fontWeight: 700, fontFamily: 'monospace',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          zIndex: 10,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,106,26,0.25)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,106,26,0.7)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,106,26,0.12)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,106,26,0.35)';
        }}
      >
        ?
      </button>

      {/* Overlay + Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cómo jugar"
          onClick={e => { if (e.target === e.currentTarget) close(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            background: '#130e0a',
            border: '1px solid rgba(255,106,26,0.25)',
            borderRadius: 12,
            width: '100%', maxWidth: 560,
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 22px 14px',
              borderBottom: '1px solid rgba(255,106,26,0.15)',
            }}>
              <div>
                <p style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, color: '#FF6A1A', letterSpacing: 2, margin: 0 }}>
                  4 AMIGOS
                </p>
                <p style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(246,239,222,0.4)', margin: 0, textTransform: 'uppercase' }}>
                  Guía de juego
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Cerrar"
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(246,239,222,0.5)', fontSize: 14,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>

            {/* Tabs de pasos */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {STEPS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setStep(i)}
                  style={{
                    flex: 1, padding: '12px 8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${step === i ? '#FF6A1A' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', margin: '0 auto 4px',
                    background: step === i ? '#FF6A1A' : 'rgba(255,106,26,0.15)',
                    border: `1px solid ${step === i ? '#FF6A1A' : 'rgba(255,106,26,0.3)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontFamily: 'monospace',
                    color: step === i ? '#130e0a' : '#FF6A1A',
                    fontWeight: step === i ? 700 : 400,
                  }}>{i + 1}</div>
                  <p style={{
                    fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
                    textTransform: 'uppercase', margin: 0,
                    color: step === i ? 'rgba(246,239,222,0.8)' : 'rgba(246,239,222,0.35)',
                  }}>{label}</p>
                </button>
              ))}
            </div>

            {/* Contenido */}
            <div style={{ padding: '22px 22px 18px', minHeight: 240 }}>
              {step === 0 && <Step1 />}
              {step === 1 && <Step2 />}
              {step === 2 && <Step3 />}
              {step === 3 && <Step4 />}
            </div>

            {/* Navegación */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 22px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <button
                onClick={prev}
                disabled={step === 0}
                style={{
                  ...styles.navBtn,
                  opacity: step === 0 ? 0.3 : 1,
                  cursor: step === 0 ? 'default' : 'pointer',
                }}
              >← Anterior</button>

              {/* Dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: i === step ? '#FF6A1A' : 'rgba(255,255,255,0.15)',
                    transition: 'background 0.15s',
                  }} />
                ))}
              </div>

              <button
                onClick={next}
                style={{ ...styles.navBtn, background: '#FF6A1A', borderColor: '#FF6A1A', color: '#130e0a', fontWeight: 700 }}
              >
                {step === STEPS.length - 1 ? '¡Listo! ✓' : 'Siguiente →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────── Estilos compartidos ─────────────────────────────

const styles = {
  bigTitle: {
    fontSize: 18, fontWeight: 600, color: '#f6efde', margin: '0 0 4px',
  } as React.CSSProperties,
  sub: {
    fontSize: 13, color: 'rgba(246,239,222,0.5)', margin: '0 0 16px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
  cardRow: {
    display: 'flex', gap: 6,
  } as React.CSSProperties,
  cardLabel: {
    fontSize: 9, color: 'rgba(246,239,222,0.35)', fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase' as const, margin: '4px 0 0', textAlign: 'center' as const,
  } as React.CSSProperties,
  infoBox: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    borderLeft: '2px solid rgba(255,106,26,0.5)',
    borderRadius: '0 6px 6px 0',
    fontSize: 11, color: 'rgba(246,239,222,0.55)',
    fontFamily: 'monospace', lineHeight: 1.7,
  } as React.CSSProperties,
  exampleRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  } as React.CSSProperties,
  arrow: {
    color: '#FF6A1A', fontSize: 16,
  } as React.CSSProperties,
  verdictOk: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 5,
    fontSize: 11, fontFamily: 'monospace', letterSpacing: 1,
    background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.35)',
    color: '#3dd68c',
  } as React.CSSProperties,
  verdictNo: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 5,
    fontSize: 11, fontFamily: 'monospace', letterSpacing: 1,
    background: 'rgba(226,75,74,0.12)', border: '1px solid rgba(226,75,74,0.3)',
    color: '#f87171',
  } as React.CSSProperties,
  specialCard: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
  } as React.CSSProperties,
  navBtn: {
    padding: '8px 18px', borderRadius: 6,
    fontSize: 12, fontFamily: 'monospace', letterSpacing: 1,
    textTransform: 'uppercase' as const,
    border: '1px solid rgba(255,106,26,0.35)',
    background: 'transparent', color: 'rgba(246,239,222,0.6)',
    cursor: 'pointer',
  } as React.CSSProperties,
};
