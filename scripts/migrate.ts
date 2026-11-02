/**
 * Aplica as migrações. Na Vercel roda automaticamente no build de PRODUÇÃO
 * (previews são ignorados para não mexer no banco real).
 *
 * Usa DATABASE_URL_MIGRACAO se existir (no Supabase: o "Session pooler", porta 5432),
 * senão DATABASE_URL.
 *
 * Primeiro acesso: se ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA estiverem definidos e ainda
 * não existir nenhum admin, cria o admin. Depois de entrar, apague essas duas variáveis.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { configBanco } from "../src/db/conexao";

if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Ambiente "${process.env.VERCEL_ENV}": migrações ignoradas (só rodam em produção).`);
  process.exit(0);
}

const pool = new Pool(configBanco(process.env.DATABASE_URL_MIGRACAO || process.env.DATABASE_URL, { max: 1 }));
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Migrações aplicadas.");

  const email = process.env.ADMIN_INICIAL_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_INICIAL_SENHA;
  if (email && senha) {
    const { rows } = await pool.query("select 1 from usuarios where papel = 'admin' limit 1");
    if (rows.length) console.log("[migrate] Já existe admin: ADMIN_INICIAL_* ignorado. Pode apagar essas variáveis.");
    else if (senha.length < 10) throw new Error("ADMIN_INICIAL_SENHA precisa ter pelo menos 10 caracteres.");
    else {
      await pool.query("insert into usuarios (papel, nome, email, senha_hash) values ('admin', $1, $2, $3)", [
        process.env.ADMIN_INICIAL_NOME?.trim() || "Administrador",
        email,
        await bcrypt.hash(senha, 11),
      ]);
      console.log(`[migrate] Admin inicial criado: ${email}. Apague ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA da Vercel.`);
    }
  }
} finally {
  await pool.end();
}
