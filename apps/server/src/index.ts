import http from "http";
import express from "express";
import cors from "cors";
import { PORT } from "./config.js";
import { authMiddleware } from "./auth/middleware.js";
import authRoutes from "./auth/routes.js";
import { setupSocket } from "./socket/index.js";

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);

setupSocket(server);

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
