import type { PlayerState, Room } from "shared-types";
import { upsertPlayerState, removePlayerState, updateRoomState, getPlayerState } from "../db/index.js";

export const ROOMS: Room[] = [
  { id: "town-square", name: "Town Square", description: "The central gathering place", playerCount: 0 },
  { id: "forest", name: "Forest", description: "A quiet wooded area", playerCount: 0 },
  { id: "beach", name: "Beach", description: "Sandy shores and calm waters", playerCount: 0 },
  { id: "office", name: "Office", description: "Collaborative workspace with zones", playerCount: 0 },
];

interface RoomState {
  players: Map<string, PlayerState>;
  zoneOccupancy: Map<string, number>;
}

const roomStates = new Map<string, RoomState>();

ROOMS.forEach((r) => roomStates.set(r.id, { players: new Map(), zoneOccupancy: new Map() }));

export function joinRoom(roomId: string, player: PlayerState): PlayerState[] {
  const state = roomStates.get(roomId);
  if (!state) return [];

  state.players.set(player.id, player);

  const room = ROOMS.find((r) => r.id === roomId);
  if (room) room.playerCount = state.players.size;

  // Persist to database
  upsertPlayerState(player.id, roomId, player.x, player.y).catch(console.error);
  updateRoomState(roomId, state.players.size, Object.fromEntries(state.zoneOccupancy)).catch(console.error);

  return Array.from(state.players.values()).filter((p) => p.id !== player.id);
}

export async function joinRoomWithState(roomId: string, player: PlayerState): Promise<{ otherPlayers: PlayerState[]; savedState: any }> {
  const state = roomStates.get(roomId);
  if (!state) return { otherPlayers: [], savedState: null };

  // Check if player has saved state
  const savedState = await getPlayerState(player.id, roomId);
  
  if (savedState) {
    // Restore player position
    player.x = savedState.x;
    player.y = savedState.y;
  }

  // Note: player is already in state.players from the sync joinRoom call

  const room = ROOMS.find((r) => r.id === roomId);
  if (room) room.playerCount = state.players.size;

  // Persist to database (best-effort — FK errors handled by ensureUser in socket handler)
  try {
    await upsertPlayerState(player.id, roomId, player.x, player.y);
    await updateRoomState(roomId, state.players.size, Object.fromEntries(state.zoneOccupancy));
  } catch (err) {
    console.warn('DB persist failed (non-fatal):', err);
  }

  return {
    otherPlayers: Array.from(state.players.values()).filter((p) => p.id !== player.id),
    savedState
  };
}

export function leaveRoom(roomId: string, playerId: string): PlayerState {
  const state = roomStates.get(roomId);
  if (!state) return null as unknown as PlayerState;

  state.players.delete(playerId);

  const room = ROOMS.find((r) => r.id === roomId);
  if (room) room.playerCount = state.players.size;

  // Remove from database
  removePlayerState(playerId, roomId).catch(console.error);
  updateRoomState(roomId, state.players.size, Object.fromEntries(state.zoneOccupancy)).catch(console.error);

  return state.players.size > 0 ? Array.from(state.players.values())[0] : null as unknown as PlayerState;
}

export function updatePlayerPosition(roomId: string, playerId: string, x: number, y: number, currentZone?: string): PlayerState | null {
  const state = roomStates.get(roomId);
  if (!state) return null;

  const player = state.players.get(playerId);
  if (!player) return null;

  player.x = x;
  player.y = y;

  // Update zone occupancy
  if (currentZone) {
    const currentCount = state.zoneOccupancy.get(currentZone) || 0;
    state.zoneOccupancy.set(currentZone, currentCount + 1);
  }

  // Persist to database (debounced in production)
  upsertPlayerState(playerId, roomId, x, y, currentZone).catch(console.error);
  updateRoomState(roomId, state.players.size, Object.fromEntries(state.zoneOccupancy)).catch(console.error);

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
