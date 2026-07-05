import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3001);
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
