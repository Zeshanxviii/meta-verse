export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  googleId: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  message: string;
}

export interface GoogleCredentialRequest {
  credential: string;
}

// --- Room types ---

export interface Room {
  id: string;
  name: string;
  description: string;
  playerCount: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  x: number;
  y: number;
}

export interface RoomJoinPayload {
  roomId: string;
  token: string;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
}

export interface ServerEvent {
  type: "player:joined" | "player:left" | "player:moved";
  roomId: string;
  player: PlayerState;
}

// --- Chat types ---

export interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}
