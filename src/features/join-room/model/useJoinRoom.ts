"use client";

import { useCallback, useState } from "react";
import { connectSocket } from "@/src/shared/api/socket";
import { useGameStore } from "@/src/entities/game";

export function useJoinRoom() {
	const [isLoading, setIsLoading] = useState(false);
	const {
		setRoom,
		setConnectionStatus,
		setSocketId,
		setGameView,
		setGameEnd,
		handlePlayResult,
		handleInterceptResult,
		addNotification,
		addFloatingReaction,
		reset,
	} = useGameStore();

	const joinRoom = useCallback(
		(roomId: string, playerName: string) => {
			setIsLoading(true);
			setConnectionStatus("connecting");

			const socket = connectSocket();

			socket.off("connect");
			socket.off("disconnect");
			socket.off("CONNECTED");
			socket.off("ROOM_STATE");
			socket.off("GAME_START");
			socket.off("GAME_END");
			socket.off("GAME_RESTARTED");
			socket.off("PLAY_RESULT");
			socket.off("INTERCEPT_RESULT");
			socket.off("ERROR");
			socket.off("PLAYER_REACTION");

			// El servidor emite CONNECTED en cuanto abre la conexión WS.
			// Es más fiable que el evento "connect" (onopen) del singleton,
			// que puede no re-dispararse si el socket ya estaba abierto.
			socket.on("CONNECTED", (payload) => {
				const { playerId } = payload as { playerId: string };
				setSocketId(playerId);
				setConnectionStatus("connected");
				socket.emit("JOIN_ROOM", {
					roomId: roomId.toUpperCase().trim(),
					playerName: playerName.trim(),
				});
				setIsLoading(false);
			});

			// Fallback: si el WS ya estaba abierto (singleton reconectado),
			// CONNECTED no vuelve a llegar — enviamos JOIN_ROOM directamente.
			socket.on("connect", () => {
				setConnectionStatus("connected");
			});

			socket.on("disconnect", () => {
				setConnectionStatus("disconnected");
				addNotification("warning", "Conexion perdida. Reconectando...");
			});

			socket.on("ROOM_STATE", ({ view }) => {
				const serverElapsedMs = Math.max(
					0,
					view.serverNow - view.turnStartedAt,
				);
				const adjustedView = {
					...view,
					turnStartedAt: Date.now() - serverElapsedMs,
				};
				setGameView(adjustedView);
				setRoom(view.roomId, playerName.trim());
			});

			socket.on("GAME_START", ({ roomId: rid }) => {
				addNotification(
					"info",
					"La partida en la sala " + rid + " ha comenzado!",
				);
			});

			socket.on("GAME_END", (payload) => {
				setGameEnd(payload);
			});

			socket.on("GAME_RESTARTED", () => {
				reset();
				addNotification("info", "Nueva partida! Volviendo al lobby...");
				socket.emit("JOIN_ROOM", {
					roomId: roomId.toUpperCase().trim(),
					playerName: playerName.trim(),
				});
			});

			socket.on("PLAY_RESULT", (result) => {
				handlePlayResult(result);
			});

			socket.on("INTERCEPT_RESULT", (result) => {
				handleInterceptResult(result);
			});

			socket.on(
				"PLAYER_REACTION",
				({ playerId, playerName, playerColor, emoji }) => {
					addFloatingReaction(emoji, playerName, playerColor);
				},
			);

			socket.on("ERROR", ({ message }) => {
				addNotification("error", message);
				setIsLoading(false);
			});

			if (socket.connected) {
				setConnectionStatus("connected");
				socket.emit("JOIN_ROOM", {
					roomId: roomId.toUpperCase().trim(),
					playerName: playerName.trim(),
				});
				setIsLoading(false);
			}
		},
		[
			setRoom,
			setConnectionStatus,
			setSocketId,
			setGameView,
			setGameEnd,
			handlePlayResult,
			handleInterceptResult,
			addNotification,
			addFloatingReaction,
			reset,
		],
	);

	return { joinRoom, isLoading };
}
