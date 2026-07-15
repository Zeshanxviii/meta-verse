import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL } from "../config.js";
import * as schema from "./schema.js";
import { eq, and } from "drizzle-orm";

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
export { schema };

export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;
export type PlayerState = typeof schema.playerStates.$inferSelect;
export type NewPlayerState = typeof schema.playerStates.$inferInsert;
export type RoomState = typeof schema.roomStates.$inferSelect;
export type NewRoomState = typeof schema.roomStates.$inferInsert;

// Ensure user exists — called on WebSocket connect to handle DB-reset edge cases
export async function ensureUser(userId: string, email: string) {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.id, userId)
  });
  if (existing) return;
  await db.insert(schema.users).values({
    id: userId,
    email,
    displayName: email,
    googleId: `ws-${userId}`,
  }).onConflictDoNothing();
}

// Player state operations
export async function upsertPlayerState(userId: string, roomId: string, x: number, y: number, currentZone?: string) {
  try {
    const existing = await db.query.playerStates.findFirst({
      where: and(eq(schema.playerStates.userId, userId), eq(schema.playerStates.roomId, roomId))
    });

    if (existing) {
      await db.update(schema.playerStates)
        .set({ x, y, currentZone, updatedAt: new Date() })
        .where(eq(schema.playerStates.id, existing.id));
    } else {
      await db.insert(schema.playerStates).values({
        userId, roomId, x, y, currentZone
      });
    }
  } catch (err: unknown) {
    const pgErr = err as { cause?: { code?: string } };
    if (pgErr?.cause?.code === "23503") {
      console.warn(`Player state persist skipped: user ${userId} not yet in DB (non-fatal)`);
      return;
    }
    throw err;
  }
}

export async function getPlayerState(userId: string, roomId: string) {
  return await db.query.playerStates.findFirst({
    where: and(eq(schema.playerStates.userId, userId), eq(schema.playerStates.roomId, roomId))
  });
}

export async function removePlayerState(userId: string, roomId: string) {
  const existing = await db.query.playerStates.findFirst({
    where: and(eq(schema.playerStates.userId, userId), eq(schema.playerStates.roomId, roomId))
  });
  if (existing) {
    await db.delete(schema.playerStates).where(eq(schema.playerStates.id, existing.id));
  }
}

// Room state operations
export async function updateRoomState(roomId: string, playerCount: number, zoneOccupancy: Record<string, number>) {
  const existing = await db.query.roomStates.findFirst({
    where: eq(schema.roomStates.roomId, roomId)
  });

  if (existing) {
    await db.update(schema.roomStates)
      .set({ playerCount, zoneOccupancy, lastActivityAt: new Date() })
      .where(eq(schema.roomStates.id, existing.id));
  } else {
    await db.insert(schema.roomStates).values({
      roomId, playerCount, zoneOccupancy
    });
  }
}

export async function getRoomState(roomId: string) {
  return await db.query.roomStates.findFirst({
    where: eq(schema.roomStates.roomId, roomId)
  });
}
