import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { GOOGLE_CLIENT_ID, JWT_SECRET } from "../config.js";
import type { AuthPayload } from "./middleware.js";
import { authMiddleware } from "./middleware.js";

const router = Router();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ message: "Missing credential" });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload?.sub) {
      res.status(400).json({ message: "Invalid Google token" });
      return;
    }

    const now = new Date();
    let user = await db.query.users.findFirst({
      where: eq(schema.users.googleId, payload.sub),
    });

    if (user) {
      const [updated] = await db
        .update(schema.users)
        .set({ lastLoginAt: now })
        .where(eq(schema.users.googleId, payload.sub))
        .returning();
      user = updated;
    } else {
      const [created] = await db
        .insert(schema.users)
        .values({
          email: payload.email,
          displayName: payload.name ?? payload.email,
          avatarUrl: payload.picture ?? null,
          googleId: payload.sub,
          lastLoginAt: now,
        })
        .returning();
      user = created;
    }

    const authPayload: AuthPayload = { userId: user.id, email: user.email };
    const token = jwt.sign(authPayload, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt.toISOString(),
      },
      token,
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ message: "Authentication failed" });
  }
});

router.post("/dev-login", async (req, res) => {
  try {
    const { displayName } = req.body as { displayName?: string };
    const name = displayName ?? "Dev User";
    const suffix = Date.now() + Math.random().toString(36).slice(2, 6);

    const now = new Date();

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `dev-${suffix}@metaverse.local`,
        displayName: name,
        googleId: `dev-${suffix}`,
        lastLoginAt: now,
      })
      .returning();

    const authPayload: AuthPayload = { userId: user.id, email: user.email };
    const token = jwt.sign(authPayload, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt.toISOString(),
      },
      token,
    });
  } catch (err) {
    console.error("Dev login error:", err);
    res.status(500).json({ message: "Dev login failed" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, req.user.userId),
  });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    googleId: user.googleId,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt.toISOString(),
  });
});

export default router;
