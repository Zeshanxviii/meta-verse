import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL } from "../config.js";
import * as schema from "./schema.js";

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
export { schema };
