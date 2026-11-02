/** Provoca erros REAIS de conexão e confere a tradução (e que a senha nunca aparece). */
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { configBanco } from "@/db/conexao";
import { diagnosticarErroBanco } from "@/lib/diagnostico";

async function erroDe(url: string, sql = "select 1 from usuarios") {
  try {
    const pool = new Pool({ ...configBanco(url), connectionTimeoutMillis: 3000 });
    try { await pool.query(sql); } finally { await pool.end().catch(() => {}); }
  } catch (e) {
    return diagnosticarErroBanco(e, url);
  }
  throw new Error("esperava erro");
}

describe("diagnóstico de conexão", () => {
  it("senha errada", async () => {
    const d = await erroDe("postgres://rota:SenhaErrada123@localhost:5432/rota_dev");
    expect(d.problema).toBe("Senha do banco incorreta.");
    expect(JSON.stringify(d)).not.toContain("SenhaErrada123");
  });
  it("servidor inexistente", async () => {
    const d = await erroDe("postgres://rota:x@servidor-que-nao-existe.invalid:6543/postgres");
    expect(d.problema).toMatch(/não foi encontrado/);
  });
  it("tabelas não existem (banco errado)", async () => {
    const d = await erroDe("postgres://rota:rota@localhost:5432/postgres");
    expect(d.problema).toMatch(/tabelas não existem/);
  });
  it("porta fechada", async () => {
    const d = await erroDe("postgres://rota:rota@localhost:6599/postgres");
    expect(d.problema).toMatch(/Não foi possível conectar/);
  });
  it("URL mal formada e variável ausente", () => {
    expect(() => configBanco("postgresql://postgres.abc:se@nha#1@host:6543/postgres")).toThrow();
    let d;
    try { configBanco("postgresql://postgres.abc:se@nha#1@host:6543/postgres"); } catch (e) { d = diagnosticarErroBanco(e); }
    expect(d!.problema).toMatch(/mal formado/);
    try { configBanco(undefined); } catch (e) { d = diagnosticarErroBanco(e); }
    expect(d!.problema).toMatch(/não existe neste deploy/);
  });
  it("mensagem do Supabase 'Tenant or user not found'", () => {
    expect(diagnosticarErroBanco({ code: "XX000", message: "Tenant or user not found" }).solucao).toMatch(/aws-0 por aws-1/);
  });
  it("erro desconhecido não vaza a senha", () => {
    const d = diagnosticarErroBanco({ message: "falhou com SegredoXYZ no meio" }, "postgres://u:SegredoXYZ@h:1/d");
    expect(d.codigo).not.toContain("SegredoXYZ");
  });
});
