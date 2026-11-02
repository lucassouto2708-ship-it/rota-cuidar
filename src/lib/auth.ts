/** Ponte entre as regras de sessão e o Next (cookies, redirecionamentos). */
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Papel } from "@/db/schema";
import { ErroNegocio, ErroPermissao } from "./erros";
import type { Ator } from "./permissoes";
import { COOKIE_SESSAO, encerrarSessao, validarSessao, type UsuarioSessao } from "./sessao";

export const HOME_DO_PAPEL: Record<Papel, string> = { admin: "/admin", gestor: "/gestor", paciente: "/paciente" };

export async function gravarCookieSessao(token: string, expiraEm: Date) {
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

export async function tokenAtual() {
  return (await cookies()).get(COOKIE_SESSAO)?.value;
}

/** Usuário logado (uma consulta por requisição, graças ao cache). */
export const usuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const r = await validarSessao(await tokenAtual());
  return r?.usuario ?? null;
});

export function comoAtor(u: UsuarioSessao): Ator {
  return { id: u.id, papel: u.papel, secretariaId: u.secretariaId };
}

/**
 * Use no topo de TODA página e TODA server action protegida.
 * Sem login → tela de entrada. Papel errado → home do próprio papel.
 */
export async function exigir(...papeis: Papel[]): Promise<{ usuario: UsuarioSessao; ator: Ator }> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  if (!papeis.includes(u.papel)) redirect(HOME_DO_PAPEL[u.papel]);
  return { usuario: u, ator: comoAtor(u) };
}

/** Igual a exigir(), mas também obriga a trocar a senha provisória antes de usar o sistema. */
export async function exigirComSenhaDefinitiva(...papeis: Papel[]) {
  const r = await exigir(...papeis);
  if (r.usuario.trocarSenha) redirect("/conta/senha");
  return r;
}

export async function sair() {
  const token = await tokenAtual();
  if (token) await encerrarSessao(token);
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function ipDaRequisicao() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export type EstadoAcao = { erro?: string; ok?: string; senhaProvisoria?: string } | null;

/** Converte erros de negócio em mensagem para o formulário; outros erros sobem (e são logados). */
export async function executarAcao(fn: () => Promise<EstadoAcao>): Promise<EstadoAcao> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroPermissao || e instanceof ErroNegocio) return { erro: e.message };
    throw e;
  }
}
