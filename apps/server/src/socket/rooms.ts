import type { PlayerState, Room } from "shared-types";

export const ROOMS: Room[] = [
  { id: "town-square", name: "Town Square", description: "The central gathering place", playerCount: 0 },
  { id: "forest", name: "Forest", description: "A quiet wooded area", playerCount: 0 },
  { id: "beach", name: "Beach", description: "Sandy shores and calm waters", playerCount: 0 },
];

interface RoomState {
  players: Map<string, PlayerState>;
}

const roomStates = new Map<string, RoomState>();

ROOMS.forEach((r) => roomStates.set(r.id, { players: new Map() }));

export function joinRoom(roomId: string, player: PlayerState): PlayerState[] {
  const state = roomStates.get(roomId);
  if (!state) return [];

  state.players.set(player.id, player);

  const room = ROOMS.find((r) => r.id === roomId);
  if (room) room.playerCount = state.players.size;

  return Array.from(state.players.values()).filter((p) => p.id !== player.id);
}

export function leaveRoom(roomId: string, playerId: string): PlayerState {
  const state = roomStates.get(roomId);
  if (!state) return null as unknown as PlayerState;

  state.players.delete(playerId);

  const room = ROOMS.find((r) => r.id === roomId);
  if (room) room.playerCount = state.players.size;

  return state.players.size > 0 ? Array.from(state.players.values())[0] : null as unknown as PlayerState;
}

export function updatePlayerPosition(roomId: string, playerId: string, x: number, y: number): PlayerState | null {
  const state = roomStates.get(roomId);
  if (!state) return null;

  const player = state.players.get(playerId);
  if (!player) return null;

  player.x = x;
  player.y = y;

  return player;
}

export function getPlayersInRoom(roomId: string): PlayerState[] {
  const state = roomStates.get(roomId);
  if (!state) return [];
  return Array.from(state.players.values());
}

export function getRooms(): Room[] {
  return ROOMS.map((r) => ({ ...r }));
}
