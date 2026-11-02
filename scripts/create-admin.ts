/**
 * Cria (ou redefine a senha de) um ADMIN da plataforma.
 * Uso: npm run admin:create -- "Seu Nome" voce@email.com
 * A senha é pedida no terminal (não fica no histórico do shell).
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { hashSenha, SENHA_MIN } from "../src/lib/senha";

const [nome, emailBruto] = process.argv.slice(2);
if (!nome || !emailBruto) {
  console.error('Uso: npm run admin:create -- "Seu Nome" voce@email.com');
  process.exit(1);
}
const email = emailBruto.trim().toLowerCase();
const senha = process.env.ADMIN_SENHA ?? (await createInterface({ input: process.stdin, output: process.stdout }).question("Senha: "));
if (senha.length < SENHA_MIN) {
  console.error(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  process.exit(1);
}
const [existente] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
if (existente && existente.papel !== "admin") {
  console.error("Este e-mail já pertence a um usuário que não é admin.");
  process.exit(1);
}
const senhaHash = await hashSenha(senha);
if (existente) {
  await db.update(schema.usuarios).set({ senhaHash, nome, ativo: true, trocarSenha: false }).where(eq(schema.usuarios.id, existente.id));
  console.log(`Senha do admin ${email} redefinida.`);
} else {
  await db.insert(schema.usuarios).values({ papel: "admin", nome, email, senhaHash });
  console.log(`Admin ${email} criado.`);
}
await pool.end();
process.exit(0);
