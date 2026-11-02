/** Dados de DEMONSTRAÇÃO para desenvolvimento. Nunca rode em produção. */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { hashSenha } from "../src/lib/senha";

if (process.env.NODE_ENV === "production") throw new Error("Seed não roda em produção.");
const SENHA = "demo12345";
const hash = await hashSenha(SENHA);

async function secretaria(nome: string, municipio: string, uf: string, slug: string) {
  const [ja] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.slug, slug));
  return ja ?? (await db.insert(schema.secretarias).values({ nome, municipio, uf, slug }).returning())[0];
}

await db.insert(schema.usuarios).values({ papel: "admin", nome: "Admin Demo", email: "admin@demo.com", senhaHash: hash }).onConflictDoNothing();
const a = await secretaria("Secretaria Municipal de Saúde de Vila Verde", "Vila Verde", "SP", "vila-verde");
const b = await secretaria("Secretaria Municipal de Saúde de Serra Alta", "Serra Alta", "MG", "serra-alta");
await db.insert(schema.usuarios).values([
  { papel: "gestor", secretariaId: a.id, nome: "Gestora Vila Verde", email: "gestor@vilaverde.demo", senhaHash: hash },
  { papel: "gestor", secretariaId: b.id, nome: "Gestor Serra Alta", email: "gestor@serraalta.demo", senhaHash: hash },
  { papel: "paciente", secretariaId: a.id, nome: "Maria Oliveira", cpf: "52998224725", telefone: "(19) 99999-0001", senhaHash: hash },
  { papel: "paciente", secretariaId: b.id, nome: "José Santos", cpf: "11144477735", telefone: "(31) 99999-0002", senhaHash: hash },
]).onConflictDoNothing();

console.log(`Dados de demonstração prontos (senha de todos: ${SENHA}):
  Admin:            admin@demo.com           → /entrar
  Gestor Vila Verde: gestor@vilaverde.demo   → /entrar
  Gestor Serra Alta: gestor@serraalta.demo   → /entrar
  Paciente Maria:   CPF 529.982.247-25       → /vila-verde/entrar
  Paciente José:    CPF 111.444.777-35       → /serra-alta/entrar`);
await pool.end();
