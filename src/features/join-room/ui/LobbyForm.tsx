'use client';

import React, { useState } from 'react';
import { useJoinRoom } from '../model/useJoinRoom';
import { HowToPlay } from '@/src/features/how-to-play';

export function LobbyForm() {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const { joinRoom, isLoading } = useJoinRoom();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !playerName.trim()) return;
    joinRoom(roomId, playerName);
  };

  const handleRandomRoom = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1.5px solid rgba(255,106,26,0.3)',
    borderRadius: 6,
    padding: '12px 14px',
    color: '#f6efde',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: 2,
    color: 'rgba(246,239,222,0.5)',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0807',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* Botón ? y modal de reglas */}
      <HowToPlay />
      {/* Fondo de textura de madera */}
      <div style={{
        position: 'fixed', inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 50% 50%, #3a2818 0%, #1c1209 60%, #0a0604 100%)`,
        zIndex: 0,
      }} />

      {/* Panel central */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 440,
        background: 'rgba(14,11,8,0.85)',
        border: '1px solid rgba(255,106,26,0.2)',
        borderRadius: 12,
        padding: '40px 36px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: 48,
            color: '#FF6A1A',
            letterSpacing: 4,
            lineHeight: 1,
          }}>
            4 AMIGOS
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: 'rgba(246,239,222,0.4)',
            letterSpacing: 4,
            marginTop: 6,
          }}>
            — ROMPE AMISTADES —
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Nombre del jugador */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Tu nombre</label>
            <input
              style={inputStyle}
              placeholder="Ej: CHUY_X"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
              required
              disabled={isLoading}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,106,26,0.8)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,106,26,0.3)')}
            />
          </div>

          {/* ID de sala */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Código de sala</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
                placeholder="Ej: A8K3Z2"
                value={roomId}
                onChange={e => setRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={8}
                required
                disabled={isLoading}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,106,26,0.8)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,106,26,0.3)')}
              />
              <button
                type="button"
                onClick={handleRandomRoom}
                disabled={isLoading}
                style={{
                  padding: '0 14px',
                  background: 'transparent',
                  border: '1.5px solid rgba(255,106,26,0.3)',
                  borderRadius: 6,
                  color: 'rgba(255,106,26,0.7)',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
                title="Generar sala aleatoria"
              >
                CREAR
              </button>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(246,239,222,0.35)', marginBottom: 28, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            Comparte el código con tus amigos. La partida inicia al llegar 4 jugadores (o manualmente con 2+).
          </p>

          {/* Botón de entrar */}
          <button
            type="submit"
            disabled={isLoading || !roomId.trim() || !playerName.trim()}
            style={{
              width: '100%',
              padding: '16px 0',
              background: isLoading ? 'rgba(255,106,26,0.3)' : '#FF6A1A',
              border: 'none',
              borderRadius: 6,
              color: '#0e0b08',
              fontFamily: 'Anton, sans-serif',
              fontSize: 18,
              letterSpacing: 3,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s, transform 0.1s',
              transform: isLoading ? 'none' : undefined,
            }}
          >
            {isLoading ? 'CONECTANDO...' : 'ENTRAR A LA MESA ▸'}
          </button>
        </form>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <span style={{ fontSize: 10, color: 'rgba(246,239,222,0.2)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            2 BARAJAS · 4 JUGADORES · INTERCEPCIÓN EN TIEMPO REAL
          </span>
        </div>
      </div>
    </div>
  );
}
