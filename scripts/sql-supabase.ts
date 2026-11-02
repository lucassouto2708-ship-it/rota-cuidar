/**
 * Gera supabase/01_estrutura.sql juntando as migrações de drizzle/ num arquivo só,
 * para colar no SQL Editor do Supabase. Também registra as migrações na tabela de
 * controle do Drizzle, para o `npm run db:migrate` saber que já foram aplicadas.
 * Uso: npm run sql:supabase
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
const partes: string[] = [
  "-- ============================================================",
  "-- ROTA CUIDAR · PASSO 1: ESTRUTURA DO BANCO",
  "-- Cole TUDO no SQL Editor do Supabase e clique em RUN.",
  "-- Roda numa transação: se algo falhar, nada fica pela metade.",
  "-- ============================================================",
  "begin;",
  "",
];
const registros: string[] = [];
for (const e of journal.entries) {
  const sql = readFileSync(`drizzle/${e.tag}.sql`, "utf8");
  partes.push(`-- ───── ${e.tag} ─────`, sql.trim(), "");
  const hash = createHash("sha256").update(sql).digest("hex");
  registros.push(`  ('${hash}', ${e.when})`);
}
partes.push(
  "-- ───── controle de versões (usado pelo npm run db:migrate) ─────",
  'create schema if not exists "drizzle";',
  'create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);',
  'insert into "drizzle"."__drizzle_migrations" (hash, created_at) values',
  registros.join(",\n") + ";",
  "",
  "commit;",
  "",
);
writeFileSync("supabase/01_estrutura.sql", partes.join("\n"));
console.log(`supabase/01_estrutura.sql gerado com ${journal.entries.length} migrações.`);
