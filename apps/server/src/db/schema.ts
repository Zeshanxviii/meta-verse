import { pgTable, text, timestamp, uuid, integer, jsonb, doublePrecision } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  googleId: text("google_id").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),
});

export const playerStates = pgTable("player_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  roomId: text("room_id").notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  currentZone: text("current_zone"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomStates = pgTable("room_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: text("room_id").notNull().unique(),
  playerCount: integer("player_count").notNull().default(0),
  zoneOccupancy: jsonb("zone_occupancy").$type<Record<string, number>>().default({}),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});
