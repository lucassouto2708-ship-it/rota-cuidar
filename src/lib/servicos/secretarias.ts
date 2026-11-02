/** Somente o ADMIN (dono da plataforma) gerencia secretarias e seus gestores. */
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { registrar } from "../auditoria";
import { ErroNegocio, traduzirErroBanco } from "../erros";
import { type Ator, exigirPapel } from "../permissoes";
import { gerarSenhaProvisoria, hashSenha } from "../senha";

/** Rotas fixas do app que não podem virar link de secretaria. */
export const SLUGS_RESERVADOS = new Set(["admin", "gestor", "paciente", "entrar", "sair", "conta", "api", "_next", "static"]);

export const secretariaSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome da secretaria."),
  municipio: z.string().trim().min(2, "Informe o município."),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "UF deve ter 2 letras."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Link: use letras minúsculas, números e hífen (ex.: campinas-sp).")
    .refine((s) => !SLUGS_RESERVADOS.has(s), "Este link é reservado pelo sistema."),
});

export const gestorSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  email: z.email("E-mail inválido.").trim().toLowerCase(),
  telefone: z.string().trim().optional(),
});

function validar<T>(schemaZod: z.ZodType<T>, dados: unknown): T {
  const r = schemaZod.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

export async function listarSecretarias(ator: Ator) {
  exigirPapel(ator, "admin");
  return db
    .select({
      secretaria: schema.secretarias,
      gestores: sql<number>`(select count(*)::int from usuarios u where u.secretaria_id = ${schema.secretarias.id} and u.papel = 'gestor')`,
      pacientes: sql<number>`(select count(*)::int from usuarios u where u.secretaria_id = ${schema.secretarias.id} and u.papel = 'paciente')`,
    })
    .from(schema.secretarias)
    .orderBy(asc(schema.secretarias.nome));
}

export async function obterSecretaria(ator: Ator, id: string) {
  exigirPapel(ator, "admin");
  if (!z.uuid().safeParse(id).success) return null;
  const [s] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.id, id));
  return s ?? null;
}

export async function criarSecretaria(ator: Ator, dados: unknown) {
  exigirPapel(ator, "admin");
  const v = validar(secretariaSchema, dados);
  try {
    const [s] = await db.insert(schema.secretarias).values(v).returning();
    await registrar({ acao: "secretaria.criar", usuarioId: ator.id, secretariaId: s.id, entidade: "secretaria", entidadeId: s.id });
    return s;
  } catch (e) {
    traduzirErroBanco(e, { secretarias_slug_uk: "Já existe uma secretaria com este link." });
  }
}

export async function definirSecretariaAtiva(ator: Ator, id: string, ativa: boolean) {
  exigirPapel(ator, "admin");
  const [s] = await db.update(schema.secretarias).set({ ativa }).where(eq(schema.secretarias.id, id)).returning();
  if (!s) throw new ErroNegocio("Secretaria não encontrada.");
  await registrar({ acao: ativa ? "secretaria.ativar" : "secretaria.suspender", usuarioId: ator.id, secretariaId: id, entidade: "secretaria", entidadeId: id });
  return s;
}

/** Cria o gestor com senha provisória (ele troca no primeiro acesso). */
export async function criarGestor(ator: Ator, secretariaId: string, dados: unknown) {
  exigirPapel(ator, "admin");
  const v = validar(gestorSchema, dados);
  const sec = await obterSecretaria(ator, secretariaId);
  if (!sec) throw new ErroNegocio("Secretaria não encontrada.");
  const senhaProvisoria = gerarSenhaProvisoria();
  try {
    const [u] = await db
      .insert(schema.usuarios)
      .values({
        secretariaId: sec.id,
        papel: "gestor",
        nome: v.nome,
        email: v.email,
        telefone: v.telefone || null,
        senhaHash: await hashSenha(senhaProvisoria),
        trocarSenha: true,
      })
      .returning({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email });
    await registrar({ acao: "gestor.criar", usuarioId: ator.id, secretariaId: sec.id, entidade: "usuario", entidadeId: u.id });
    return { gestor: u, senhaProvisoria };
  } catch (e) {
    traduzirErroBanco(e, { usuarios_email_uk: "Este e-mail já está em uso." });
  }
}

export async function listarGestores(ator: Ator, secretariaId: string) {
  exigirPapel(ator, "admin");
  return db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, ativo: schema.usuarios.ativo })
    .from(schema.usuarios)
    .where(sql`${schema.usuarios.secretariaId} = ${secretariaId} and ${schema.usuarios.papel} = 'gestor'`)
    .orderBy(asc(schema.usuarios.nome));
}
