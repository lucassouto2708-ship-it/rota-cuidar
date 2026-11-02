import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { configBanco } from "./conexao";
import * as schema from "./schema";

declare global {
  // Reaproveita a conexão entre recargas do `next dev` e entre requisições na Vercel
  var __rotaPool: Pool | undefined;
  var __rotaDb: NodePgDatabase<typeof schema> | undefined;
}

/**
 * A conexão só é criada na PRIMEIRA consulta (e não ao carregar o arquivo).
 * Assim o `next build` funciona sem banco/DATABASE_URL; o banco só é exigido com o site rodando.
 */
function obterPool(): Pool {
  globalThis.__rotaPool ??= new Pool(configBanco(process.env.DATABASE_URL));
  return globalThis.__rotaPool;
}

function obterDb(): NodePgDatabase<typeof schema> {
  globalThis.__rotaDb ??= drizzle(obterPool(), { schema });
  return globalThis.__rotaDb;
}

/** Repassa cada acesso para o objeto real, criado sob demanda. */
function preguicoso<T extends object>(obter: () => T): T {
  return new Proxy({} as T, {
    get(_, prop) {
      const alvo = obter();
      const valor = Reflect.get(alvo, prop, alvo);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  });
}

export const db = preguicoso(obterDb);
export const pool = preguicoso(obterPool);
export type DB = NodePgDatabase<typeof schema>;
export { schema };
