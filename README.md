# 4 Amigos — Rompe Amistades 🃏

> Variación multijugador en tiempo real del clásico **Shithead/Palace**.  
> 2 barajas · 4 jugadores · Intercepción de turno vía WebSockets.

---

## Arquitectura

```
4amigos/
├── app/                        # Next.js App Router (entry points)
├── src/
│   ├── shared/
│   │   ├── types/game.ts       # Tipos compartidos (espejo del servidor)
│   │   ├── api/socket.ts       # Singleton socket.io-client
│   │   └── ui/Card.tsx         # Componente de carta (FSD shared/ui)
│   ├── entities/
│   │   └── game/               # Zustand store del estado de juego
│   ├── features/
│   │   ├── join-room/          # Lobby form + hook de conexión
│   │   ├── play-card/          # Jugar carta / robar pozo
│   │   └── intercept/          # Mecánica de intercepción (robo de turno)
│   └── widgets/
│       └── game-board/         # Tablero completo (compone features)
└── packages/
    └── server/
        └── src/
            ├── types/game.ts   # Tipos base (fuente de verdad)
            ├── gameLogic.ts    # Reducer puro — toda la lógica del juego
            ├── roomManager.ts  # Gestión de salas en RAM
            └── server.ts       # Express + Socket.io autoritario
```

### Modelo de red

- **Servidor autoritario**: toda la lógica vive en el servidor. El cliente sólo envía _intenciones_ y recibe _vistas sanitizadas_.
- **Sanitización estricta**: cada jugador recibe `GameStateView` personalizada — nunca ve las cartas de la mano de otros ni las del mazo.
- **Intercepción en tiempo real**: la race condition es intencional. El servidor procesa el primer `INTERCEPT_TURN` que llega; los demás reciben penalización.

---

## Puesta en marcha

### Requisitos

- Node.js ≥ 18
- pnpm ≥ 8  (`npm install -g pnpm`)

### 1. Instalar dependencias

```bash
# Desde la raíz del proyecto
pnpm install

# Instalar dependencias del servidor
cd packages/server && pnpm install && cd ../..
```

### 2. Variables de entorno

El archivo `.env.local` (cliente) y `packages/server/.env` ya vienen preconfigurados para desarrollo local. Revísalos si cambias de puerto.

### 3. Arrancar en desarrollo (dos terminales)

**Terminal 1 — Servidor (puerto 3001):**
```bash
cd packages/server
npx tsx watch src/server.ts
```

**Terminal 2 — Cliente Next.js (puerto 3000):**
```bash
pnpm dev
```

O con un solo comando (requiere `concurrently`):
```bash
pnpm dev:all
```

### 4. Jugar

1. Abre `http://localhost:3000` en **4 pestañas/navegadores** distintos.
2. Cada uno elige un nombre y el mismo código de sala (ej: `MESA01`).
3. La partida inicia automáticamente al completarse 4 jugadores, o manualmente con **INICIAR PARTIDA** con 2+.

---

## Reglas principales

| Carta | Efecto |
|-------|--------|
| **2** | Reset — se juega sobre cualquier carta, reinicia el valor a 2 |
| **7** | Espejo — el siguiente debe tirar ≤ 7 (o un 2) |
| **10** | Quema — elimina el pozo, el jugador tira de nuevo |
| **As** | Carta más alta — sólo superable por As, 2 ó 10 |

**Intercepción**: cuando hay un **5** en el tope del pozo, cualquier jugador con un 5 en la mano puede emitir `INTERCEPT_TURN` y robar el turno. El primero que llega al servidor gana. Los que intentan sin tener un 5 válido recogen todo el pozo como penalización.

**Fase de ciegas**: al quedarte sin mano y sin cartas boca arriba, volteas una ciega por turno. Si sirve, se juega; si no, recoges el pozo.

---

## Eventos Socket.io

### Cliente → Servidor
| Evento | Payload |
|--------|---------|
| `JOIN_ROOM` | `{ roomId, playerName }` |
| `READY` | — (iniciar con ≥2 jugadores) |
| `PLAY_CARD` | `{ cardIds: string[] }` |
| `TAKE_PILE` | — |
| `FLIP_BLIND` | `{ cardId: string }` |
| `INTERCEPT_TURN` | `{ cardIds: string[] }` |

### Servidor → Cliente
| Evento | Payload |
|--------|---------|
| `ROOM_STATE` | `{ view: GameStateView }` (sanitizada por jugador) |
| `PLAY_RESULT` | `{ success, code, message }` |
| `INTERCEPT_RESULT` | `{ success, interceptorId, message }` |
| `GAME_START` | `{ roomId, playerOrder }` |
| `GAME_END` | `{ finishOrder, loserId }` |
| `ERROR` | `{ code, message }` |

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS |
| Patrón UI | Feature-Sliced Design (FSD) |
| Estado cliente | Zustand |
| Comunicación | socket.io-client |
| Backend | Node.js · Express · Socket.io 4 |
| Tipado | TypeScript strict mode |
| Estado servidor | RAM (Map en memoria) |
