import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import jwt from "jsonwebtoken";
import type { PlayerState, ChatMessage } from "shared-types";
import { JWT_SECRET } from "../config.js";
import { ensureUser } from "../db/index.js";
import {
  joinRoom,
  joinRoomWithState,
  leaveRoom,
  updatePlayerPosition,
  getRooms,
} from "./rooms.js";
import type { AuthPayload } from "../auth/middleware.js";

interface ClientMessage {
  type:
  | "rooms:list"
  | "room:join"
  | "player:move"
  | "chat:message"
  | "room:leave"
  | "signal";
  payload?: unknown;
}

interface ExtWebSocket extends WebSocket {
  user: AuthPayload;
  currentRoom: string | null;
  isAlive: boolean;
}

function send(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastToRoom(
  roomSockets: Map<string, Set<ExtWebSocket>>,
  roomId: string,
  type: string,
  payload: unknown,
  exclude?: ExtWebSocket
) {
  const members = roomSockets.get(roomId);
  if (!members) return;
  for (const member of members) {
    if (member !== exclude) send(member, type, payload);
  }
}

export function setupSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  // roomId -> live sockets in that room, for broadcasting
  const roomSockets = new Map<string, Set<ExtWebSocket>>();

  function leaveCurrentRoom(ws: ExtWebSocket) {
    const roomId = ws.currentRoom;
    if (!roomId) return;

    leaveRoom(roomId, ws.user.userId);

    const members = roomSockets.get(roomId);
    members?.delete(ws);
    if (members && members.size === 0) roomSockets.delete(roomId);

    broadcastToRoom(roomSockets, roomId, "player:left", {
      playerId: ws.user.userId,
    });
    ws.currentRoom = null;
  }

  // --- Auth happens at the HTTP upgrade stage, before the WS connection exists.
  // Token is passed as a query param: ws://host/ws?token=...
  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const { pathname, query } = parseUrl(req.url ?? "", true);

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const token = query.token as string | undefined;
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const extWs = ws as ExtWebSocket;
      extWs.user = payload;
      extWs.currentRoom = null;
      extWs.isAlive = true;
      wss.emit("connection", extWs, req);
    });
  });

  wss.on("connection", (rawWs: WebSocket) => {
    const ws = rawWs as ExtWebSocket;

    // Ensure user exists in DB (handles DB resets between auth and WS connect)
    ensureUser(ws.user.userId, ws.user.email).catch((err) =>
      console.warn("Failed to ensure user in DB:", err)
    );

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw: RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames
      }

      switch (msg.type) {
        case "rooms:list": {
          send(ws, "rooms:list", getRooms());
          break;
        }

        case "room:join": {
          const roomId = msg.payload as string;

          if (ws.currentRoom) {
            leaveCurrentRoom(ws);
          }

          ws.currentRoom = roomId;
          if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
          roomSockets.get(roomId)!.add(ws);

          const player: PlayerState = {
            id: ws.user.userId,
            displayName: ws.user.email,
            avatarUrl: null,
            x: Math.floor(Math.random() * 400) + 200,
            y: Math.floor(Math.random() * 300) + 150,
          };

          // 1. Join in-memory immediately so movement works right away
          const otherPlayers = joinRoom(roomId, player);

          // 2. Then try to restore saved state from DB (best-effort)
          joinRoomWithState(roomId, player).then(({ savedState }) => {
            if (savedState) {
              player.x = savedState.x;
              player.y = savedState.y;
            }
          }).catch(err => {
            console.warn('Saved state restore failed (non-fatal):', err);
          });

          send(ws, "room:joined", { roomId, players: [player, ...otherPlayers] });
          broadcastToRoom(roomSockets, roomId, "player:joined", player, ws);
          break;
        }

        case "player:move": {
          if (!ws.currentRoom) return;
          const { x, y, currentZone } = msg.payload as { x: number; y: number; currentZone?: string };
          const updated = updatePlayerPosition(ws.currentRoom, ws.user.userId, x, y, currentZone);
          if (updated) {
            broadcastToRoom(
              roomSockets,
              ws.currentRoom,
              "player:moved",
              { playerId: ws.user.userId, x, y },
              ws
            );
          }
          break;
        }

        case "chat:message": {
          if (!ws.currentRoom) return;
          const text = (msg.payload as string)?.trim();
          if (!text) return;

          const chatMsg: ChatMessage = {
            senderId: ws.user.userId,
            senderName: ws.user.email,
            text,
            timestamp: Date.now(),
          };
          // original broadcast to everyone in the room including sender
          broadcastToRoom(roomSockets, ws.currentRoom, "chat:message", chatMsg);
          break;
        }

        case "room:leave": {
          leaveCurrentRoom(ws);
          break;
        }

        case "signal": {
          if (!ws.currentRoom) return;
          const { to, signal } = msg.payload as { to: string; signal: unknown };
          const members = roomSockets.get(ws.currentRoom);
          if (!members) return;
          for (const member of members) {
            if (member.user.userId === to) {
              send(member, "signal", { from: ws.user.userId, signal });
              break;
            }
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      leaveCurrentRoom(ws);
    });
  });

  // ws has no built-in heartbeat/timeout detection like socket.io does —
  // dead sockets (e.g. laptop lid closed) never fire 'close' on their own.
  const interval = setInterval(() => {
    wss.clients.forEach((rawWs) => {
      const ws = rawWs as ExtWebSocket;
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  return wss;
}