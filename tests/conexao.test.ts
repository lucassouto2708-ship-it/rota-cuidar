import { afterEach, describe, expect, it } from "vitest";
import { configBanco } from "@/db/conexao";

const SUPABASE = "postgresql://postgres.abc:senha%40forte@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

describe("configuração da conexão", () => {
  afterEach(() => { delete process.env.DATABASE_CA_CERT; });

  it("banco local: sem SSL", () => {
    expect(configBanco("postgres://rota:rota@localhost:5432/rota_dev").ssl).toBe(false);
  });

  it("Supabase sem certificado: SSL ligado e sslmode removido da URL", () => {
    const c = configBanco(SUPABASE);
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
    expect(c.connectionString).toContain("pgbouncer=true");
    expect(c.connectionString).toContain("senha%40forte"); // senha com caractere especial preservada
  });

  it("Supabase com certificado: valida o servidor (aceita \\n escapado vindo da Vercel)", () => {
    process.env.DATABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----";
    expect(configBanco(SUPABASE).ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----", rejectUnauthorized: true });
  });

  it("sem URL: erro claro", () => {
    expect(() => configBanco(undefined)).toThrow("DATABASE_URL não configurada");
  });
});
