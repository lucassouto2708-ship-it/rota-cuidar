/**
 * Configuração da conexão com o Postgres, para uso local e em produção (Supabase + Vercel).
 *
 * - Banco local (localhost): sem SSL.
 * - Banco remoto: SSL obrigatório.
 *     • Com DATABASE_CA_CERT (o certificado do Supabase, em Settings → Database → SSL): valida o servidor.
 *     • Sem ele: conexão criptografada, mas sem validar o certificado (aviso no log).
 * - O `sslmode` da URL é removido porque o driver `pg` deixaria ele sobrepor esta configuração.
 */
import type { PoolConfig } from "pg";

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1"]);

export function configBanco(url: string | undefined, opcoes: { max?: number } = {}): PoolConfig {
  if (!url) throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
  // senha com @, # ou espaço quebra o endereço sem dar erro (o host vira outra coisa): avisa logo
  if (url.trim() !== url || (url.match(/@/g) ?? []).length !== 1 || url.includes("#"))
    throw new Error("Invalid URL: DATABASE_URL com espaço ou caractere especial (@ ou #) fora do lugar — use senha só com letras e números.");
  const u = new URL(url);
  for (const p of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) u.searchParams.delete(p);
  const local = LOCAIS.has(u.hostname);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  let ssl: PoolConfig["ssl"] = false;
  if (!local) {
    if (ca) ssl = { ca, rejectUnauthorized: true };
    else {
      ssl = { rejectUnauthorized: false };
      if (process.env.NODE_ENV === "production" && !avisado) {
        avisado = true;
        console.warn("[banco] DATABASE_CA_CERT não definido: SSL ativo, mas sem validar o certificado do servidor.");
      }
    }
  }
  return {
    connectionString: u.toString(),
    ssl,
    max: opcoes.max ?? Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}
let avisado = false;
