/**
 * Sessões guardadas no banco. O cookie leva um token aleatório; o banco guarda
 * só o SHA-256 dele. Se o banco vazar, as sessões não podem ser reaproveitadas.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Secretaria, Usuario } from "@/db/schema";

export const COOKIE_SESSAO = "rc_sessao";
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const RENOVAR_QUANDO_FALTAR_MS = 3 * 24 * 60 * 60 * 1000;

export type UsuarioSessao = Omit<Usuario, "senhaHash"> & { secretaria: Secretaria | null };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function criarSessao(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  await db.insert(schema.sessoes).values({ id: hashToken(token), usuarioId, expiraEm });
  return { token, expiraEm };
}

/**
 * Valida o token e devolve o usuário. Retorna null se a sessão expirou, o usuário
 * foi desativado ou a secretaria dele foi desativada.
 */
export async function validarSessao(
  token: string | undefined,
): Promise<{ usuario: UsuarioSessao; expiraEm: Date; renovada: boolean } | null> {
  if (!token) return null;
  const id = hashToken(token);
  const [linha] = await db
    .select({ sessao: schema.sessoes, usuario: schema.usuarios, secretaria: schema.secretarias })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sessoes.usuarioId))
    .leftJoin(schema.secretarias, eq(schema.secretarias.id, schema.usuarios.secretariaId))
    .where(and(eq(schema.sessoes.id, id), gt(schema.sessoes.expiraEm, new Date())))
    .limit(1);
  if (!linha) return null;
  const { sessao, usuario, secretaria } = linha;
  if (!usuario.ativo || (usuario.papel !== "admin" && !secretaria?.ativa)) {
    await db.delete(schema.sessoes).where(eq(schema.sessoes.id, id));
    return null;
  }
  let expiraEm = sessao.expiraEm;
  let renovada = false;
  if (expiraEm.getTime() - Date.now() < RENOVAR_QUANDO_FALTAR_MS) {
    expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
    await db.update(schema.sessoes).set({ expiraEm }).where(eq(schema.sessoes.id, id));
    renovada = true;
  }
  const { senhaHash: _omit, ...semSenha } = usuario;
  return { usuario: { ...semSenha, secretaria }, expiraEm, renovada };
}

export async function encerrarSessao(token: string) {
  await db.delete(schema.sessoes).where(eq(schema.sessoes.id, hashToken(token)));
}

/** Derruba todas as sessões do usuário (ex.: troca de senha, desativação). */
export async function encerrarSessoesDoUsuario(usuarioId: string, excetoToken?: string) {
  const doUsuario = eq(schema.sessoes.usuarioId, usuarioId);
  await db
    .delete(schema.sessoes)
    .where(excetoToken ? and(doUsuario, ne(schema.sessoes.id, hashToken(excetoToken))) : doUsuario);
}

export async function limparSessoesExpiradas() {
  await db.delete(schema.sessoes).where(lt(schema.sessoes.expiraEm, new Date()));
}
