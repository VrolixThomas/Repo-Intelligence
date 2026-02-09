import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

export function getDb() {
  return db;
}

export async function closeDb() {
  await client.end();
}
