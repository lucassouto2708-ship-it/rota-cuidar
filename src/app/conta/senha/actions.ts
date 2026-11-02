"use server";
import { redirect } from "next/navigation";
import { exigir, executarAcao, HOME_DO_PAPEL, tokenAtual, type EstadoAcao } from "@/lib/auth";
import { ErroNegocio } from "@/lib/erros";
import { trocarPropriaSenha } from "@/lib/servicos/usuarios";

export async function acaoTrocarSenha(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { usuario, ator } = await exigir("admin", "gestor", "paciente");
  let ok = false;
  const r = await executarAcao(async () => {
    const nova = String(f.get("nova") ?? "");
    if (nova !== String(f.get("confirmacao") ?? "")) throw new ErroNegocio("A confirmação não confere com a nova senha.");
    await trocarPropriaSenha(ator, String(f.get("atual") ?? ""), nova, await tokenAtual());
    ok = true;
    return null;
  });
  if (ok) redirect(HOME_DO_PAPEL[usuario.papel]);
  return r;
}
