// app/_lib/views-filters/db.ts
//
// WebSocket-based Neon client (drizzle-orm/neon-serverless) — required for
// transaction/session support, unlike the HTTP driver (neon-http) used
// elsewhere. Uses @neondatabase/serverless's Pool, which maintains a
// persistent connection via WebSocket rather than one-request-per-query.
// Requires DATABASE_URL in the environment (Neon connection string).

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — add your Neon connection string to .env.local");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });