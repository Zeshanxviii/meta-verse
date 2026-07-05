# meta-verse

A 2D metaverse built with Phaser 4, Express, Socket.io, and PostgreSQL.

## Stack

- **Frontend**: Phaser 4 + Vite + TypeScript
- **Backend**: Express + Socket.io + JWT + PostgreSQL (Drizzle ORM)
- **Auth**: Google OAuth (with dev login bypass)
- **Real-time**: Socket.io (position sync, chat)
- **Voice**: WebRTC via simple-peer

## Getting Started

```bash
# Start PostgreSQL
docker compose up -d

# Install deps
pnpm install

# Generate & run migrations
cd apps/server
pnpm db:generate && pnpm db:migrate

# Start dev servers
pnpm dev
```

Open http://localhost:5173 and click **Dev Login** to test.
