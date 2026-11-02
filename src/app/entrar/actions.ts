"use server";
import { redirect } from "next/navigation";
import { executarAcao, gravarCookieSessao, HOME_DO_PAPEL, ipDaRequisicao, type EstadoAcao } from "@/lib/auth";
import { entrarEquipe, entrarPaciente } from "@/lib/login";

export async function acaoEntrarEquipe(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  let destino = "";
  const r = await executarAcao(async () => {
    const s = await entrarEquipe(String(f.get("email") ?? ""), String(f.get("senha") ?? ""), await ipDaRequisicao());
    await gravarCookieSessao(s.token, s.expiraEm);
    destino = s.trocarSenha ? "/conta/senha" : HOME_DO_PAPEL[s.papel];
    return null;
  });
  if (destino) redirect(destino);
  return r;
}

export async function acaoEntrarPaciente(slug: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  let destino = "";
  const r = await executarAcao(async () => {
    const s = await entrarPaciente(slug, String(f.get("cpf") ?? ""), String(f.get("senha") ?? ""), await ipDaRequisicao());
    await gravarCookieSessao(s.token, s.expiraEm);
    destino = s.trocarSenha ? "/conta/senha" : HOME_DO_PAPEL[s.papel];
    return null;
  });
  if (destino) redirect(destino);
  return r;
}
