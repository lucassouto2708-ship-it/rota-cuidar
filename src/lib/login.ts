/**
 * Regras de login, sem dependência do Next (testáveis isoladamente).
 *  - Equipe (admin e gestor): e-mail + senha, em /entrar.
 *  - Paciente: CPF + senha, no link da secretaria (/[slug]/entrar).
 *  - Após 5 falhas em 15 minutos para o mesmo identificador, bloqueia temporariamente.
 */
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { registrar } from "./auditoria";
import { soDigitos } from "./cpf";
import { ErroNegocio } from "./erros";
import { conferirSenha, HASH_FICTICIO } from "./senha";
import { criarSessao } from "./sessao";

export const MAX_FALHAS = 5;
export const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;
const MSG_INVALIDO = "Dados de acesso incorretos.";

async function bloqueado(identificador: string) {
  const desde = new Date(Date.now() - JANELA_BLOQUEIO_MS);
  const [r] = await db
    .select({ n: count() })
    .from(schema.auditoria)
    .where(
      and(
        eq(schema.auditoria.acao, "login.falha"),
        gt(schema.auditoria.criadoEm, desde),
        sql`${schema.auditoria.dados}->>'identificador' = ${identificador}`,
      ),
    );
  return (r?.n ?? 0) >= MAX_FALHAS;
}

async function falhar(identificador: string, secretariaId: string | null, ip?: string | null): Promise<never> {
  await registrar({ acao: "login.falha", secretariaId, dados: { identificador }, ip });
  throw new ErroNegocio(MSG_INVALIDO);
}

export async function entrarEquipe(emailBruto: string, senha: string, ip?: string | null) {
  const email = emailBruto.trim().toLowerCase();
  const identificador = `email:${email}`;
  if (await bloqueado(identificador))
    throw new ErroNegocio("Muitas tentativas. Aguarde 15 minutos e tente novamente.");

  const [linha] = await db
    .select({ u: schema.usuarios, s: schema.secretarias })
    .from(schema.usuarios)
    .leftJoin(schema.secretarias, eq(schema.secretarias.id, schema.usuarios.secretariaId))
    .where(and(eq(schema.usuarios.email, email), inArray(schema.usuarios.papel, ["admin", "gestor"])))
    .limit(1);

  const ok = await conferirSenha(senha, linha?.u.senhaHash ?? HASH_FICTICIO);
  if (!linha || !ok) return falhar(identificador, linha?.u.secretariaId ?? null, ip);
  if (!linha.u.ativo) throw new ErroNegocio("Usuário desativado. Procure o administrador.");
  if (linha.u.papel === "gestor" && !linha.s?.ativa)
    throw new ErroNegocio("O acesso desta secretaria está suspenso.");

  const sessao = await criarSessao(linha.u.id);
  await registrar({ acao: "login", usuarioId: linha.u.id, secretariaId: linha.u.secretariaId, ip });
  return { ...sessao, papel: linha.u.papel, trocarSenha: linha.u.trocarSenha };
}

export async function entrarPaciente(slug: string, cpfBruto: string, senha: string, ip?: string | null) {
  const cpf = soDigitos(cpfBruto);
  const [sec] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.slug, slug)).limit(1);
  if (!sec || !sec.ativa) throw new ErroNegocio("Secretaria não encontrada ou com acesso suspenso.");

  const identificador = `cpf:${sec.id}:${cpf}`;
  if (await bloqueado(identificador))
    throw new ErroNegocio("Muitas tentativas. Aguarde 15 minutos e tente novamente.");

  const [u] = await db
    .select()
    .from(schema.usuarios)
    .where(
      and(eq(schema.usuarios.secretariaId, sec.id), eq(schema.usuarios.cpf, cpf), eq(schema.usuarios.papel, "paciente")),
    )
    .limit(1);

  const ok = await conferirSenha(senha, u?.senhaHash ?? HASH_FICTICIO);
  if (!u || !ok) return falhar(identificador, sec.id, ip);
  if (!u.ativo) throw new ErroNegocio("Cadastro desativado. Procure a secretaria de saúde.");

  const sessao = await criarSessao(u.id);
  await registrar({ acao: "login", usuarioId: u.id, secretariaId: sec.id, ip });
  return { ...sessao, papel: u.papel, trocarSenha: u.trocarSenha };
}
