'use client';

import React, { useState, useEffect } from 'react';
import { useJoinRoom } from '../model/useJoinRoom';
import { HowToPlay } from '@/src/features/how-to-play';

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getRoomFromURL() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search).get('room');
  return p ? p.toUpperCase().trim() : null;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)',
  border: '1.5px solid rgba(255,106,26,0.3)', borderRadius: 6,
  padding: '13px 14px', color: '#f6efde',
  fontFamily: 'JetBrains Mono, monospace', fontSize: 15, outline: 'none',
  transition: 'border-color 0.2s', boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
  letterSpacing: 2, color: 'rgba(246,239,222,0.5)', marginBottom: 6,
  textTransform: 'uppercase' as const,
};

export function LobbyForm() {
  const [playerName, setPlayerName]   = useState('');
  const [roomFromUrl, setRoomFromUrl] = useState<string | null>(null);
  const [isReady, setIsReady]         = useState(false);
  const { joinRoom, isLoading }       = useJoinRoom();

  useEffect(() => {
    setRoomFromUrl(getRoomFromURL());
    setIsReady(true);
  }, []);

  const mode = roomFromUrl ? 'join' : 'create';

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    if (!name) return;
    const roomId = generateRoomId();
    window.history.pushState({}, '', '?room=' + roomId);
    setRoomFromUrl(roomId);
    joinRoom(roomId, name);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    if (!name || !roomFromUrl) return;
    joinRoom(roomFromUrl, name);
  };

  if (!isReady) return null;

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0807',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'Inter, system-ui, sans-serif', position: 'relative',
    }}>
      <HowToPlay />
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, #3a2818 0%, #1c1209 60%, #0a0604 100%)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
        background: 'rgba(14,11,8,0.88)', border: '1px solid rgba(255,106,26,0.22)',
        borderRadius: 14, padding: '40px 36px 36px',
        backdropFilter: 'blur(12px)', boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 50, color: '#FF6A1A', letterSpacing: 5, lineHeight: 1 }}>
            4 AMIGOS
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(246,239,222,0.35)', letterSpacing: 4, marginTop: 6 }}>
            — ROMPE AMISTADES —
          </div>
        </div>

        {/* Badge sala cuando viene de invitacion */}
        {mode === 'join' && roomFromUrl && (
          <div style={{
            textAlign: 'center', marginBottom: 24, padding: '10px 16px',
            background: 'rgba(157,229,255,0.07)', border: '1px solid rgba(157,229,255,0.2)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 3, color: 'rgba(157,229,255,0.5)', marginBottom: 4 }}>
              INVITACION A LA SALA
            </div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 30, letterSpacing: 6, color: '#9DE5FF', textShadow: '0 0 20px rgba(157,229,255,0.4)' }}>
              {roomFromUrl}
            </div>
          </div>
        )}

        <form onSubmit={mode === 'join' ? handleJoin : handleCreate}>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Tu nombre</label>
            <input
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Como te llamas?"
              maxLength={20}
              autoFocus
              style={inputStyle}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,106,26,0.7)'; }}
              onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,106,26,0.3)'; }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !playerName.trim()}
            style={{
              width: '100%', padding: '14px',
              background: playerName.trim() && !isLoading ? '#FF6A1A' : 'rgba(255,106,26,0.2)',
              border: 'none', borderRadius: 8,
              color: playerName.trim() && !isLoading ? '#0e0b08' : 'rgba(246,239,222,0.3)',
              fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 3,
              cursor: playerName.trim() && !isLoading ? 'pointer' : 'default',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {isLoading ? 'CONECTANDO...' : mode === 'join' ? 'UNIRSE A LA PARTIDA' : 'CREAR SALA'}
          </button>

          {mode === 'join' && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                type="button"
                onClick={() => { window.history.pushState({}, '', '/'); setRoomFromUrl(null); }}
                style={{
                  background: 'none', border: 'none', color: 'rgba(246,239,222,0.35)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: 1,
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Crear mi propia sala
              </button>
            </div>
          )}
        </form>
      </div>
      <style>{'@import url(\'https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500&display=swap\');'}</style>
    </div>
  );
}
