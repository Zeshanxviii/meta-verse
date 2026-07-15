import { getStoredToken } from "./auth.js";

type Handler = (payload: any) => void;

interface Envelope {
  type: string;
  payload?: unknown;
}

/**
 * Minimal socket.io-client-shaped wrapper around a native WebSocket.
 * Supports on/off/emit plus synthetic "connect" / "disconnect" / "connect_error"
 * events so call sites that used socket.io's API mostly don't need to change.
 */
class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Map<string, Set<Handler>>();
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emitLocal("connect", undefined);
    };

    this.ws.onmessage = (event) => {
      let msg: Envelope;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // ignore malformed frames
      }
      this.emitLocal(msg.type, msg.payload);
    };

    this.ws.onerror = () => {
      this.emitLocal("connect_error", new Error("WebSocket error"));
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emitLocal("disconnect", undefined);
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  emit(type: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  on(type: string, handler: Handler): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  off(type: string, handler?: Handler): void {
    if (!handler) {
      this.listeners.delete(type);
      return;
    }
    this.listeners.get(type)?.delete(handler);
  }

  private emitLocal(type: string, payload: unknown): void {
    this.listeners.get(type)?.forEach((handler) => handler(payload));
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) this.connect();
    }, delay);
  }
}

function getApiBase() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const { hostname } = window.location;
  return `http://${hostname}:3001`;
}

function toWsUrl(httpBase: string, token: string | null): string {
  const wsBase = httpBase.replace(/^http/, "ws");
  const url = new URL("/ws", wsBase);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

const API_BASE = getApiBase();

let socket: WSClient | null = null;

export function getSocket(): WSClient {
  if (!socket) {
    const token = getStoredToken();
    socket = new WSClient(toWsUrl(API_BASE, token));
  }
  return socket;
}

export function connectSocket(): WSClient {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}