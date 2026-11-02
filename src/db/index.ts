import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { configBanco } from "./conexao";
import * as schema from "./schema";

declare global {
  // Reaproveita a conexão entre recargas do `next dev`
  var __rotaPool: Pool | undefined;
}

// Um pool por instância (em dev e também nas funções da Vercel, que reaproveitam a instância entre requisições)
export const pool = globalThis.__rotaPool ?? new Pool(configBanco(process.env.DATABASE_URL));
globalThis.__rotaPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
