import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import type { PlayerState, ChatMessage } from "shared-types";
import { JWT_SECRET } from "../config.js";
import { joinRoom, leaveRoom, updatePlayerPosition, getPlayersInRoom, getRooms } from "./rooms.js";
import type { AuthPayload } from "../auth/middleware.js";

interface SocketAuth {
  token?: string;
}

export function setupSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.use((socket, next) => {
    const { token } = socket.handshake.auth as SocketAuth;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
      (socket as unknown as Record<string, unknown>).user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as unknown as Record<string, unknown>).user as AuthPayload;
    let currentRoom: string | null = null;

    socket.on("rooms:list", () => {
      socket.emit("rooms:list", getRooms());
    });

    socket.on("room:join", (roomId: string) => {
      if (currentRoom) {
        socket.leave(currentRoom);
        leaveRoom(currentRoom, user.userId);
        socket.to(currentRoom).emit("player:left", { playerId: user.userId });
      }

      currentRoom = roomId;
      socket.join(roomId);

      const player: PlayerState = {
        id: user.userId,
        displayName: user.email,
        avatarUrl: null,
        x: Math.floor(Math.random() * 400) + 200,
        y: Math.floor(Math.random() * 300) + 150,
      };

      const otherPlayers = joinRoom(roomId, player);

      socket.emit("room:joined", {
        roomId,
        players: [player, ...otherPlayers],
      });

      socket.to(roomId).emit("player:joined", player);
    });

    socket.on("player:move", (data: { x: number; y: number }) => {
      if (!currentRoom) return;
      const updated = updatePlayerPosition(currentRoom, user.userId, data.x, data.y);
      if (updated) {
        socket.to(currentRoom).emit("player:moved", {
          playerId: user.userId,
          x: data.x,
          y: data.y,
        });
      }
    });

    socket.on("chat:message", (text: string) => {
      if (!currentRoom || !text.trim()) return;
      const msg: ChatMessage = {
        senderId: user.userId,
        senderName: user.email,
        text: text.trim(),
        timestamp: Date.now(),
      };
      socket.to(currentRoom).emit("chat:message", msg);
      socket.emit("chat:message", msg);
    });

    socket.on("signal", (data: { to: string; signal: unknown }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit("signal", {
        from: user.userId,
        signal: data.signal,
      });
    });

    socket.on("disconnect", () => {
      if (currentRoom) {
        leaveRoom(currentRoom, user.userId);
        socket.to(currentRoom).emit("player:left", { playerId: user.userId });
      }
    });
  });

  return io;
}
