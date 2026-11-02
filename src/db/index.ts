import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // Reaproveita a conexão entre recargas do `next dev`
  var __rotaPool: Pool | undefined;
}

function criarPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
  return new Pool({ connectionString: url, max: 10 });
}

export const pool = globalThis.__rotaPool ?? criarPool();
if (process.env.NODE_ENV !== "production") globalThis.__rotaPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
