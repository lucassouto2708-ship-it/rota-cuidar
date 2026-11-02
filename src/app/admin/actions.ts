"use server";
import { revalidatePath } from "next/cache";
import { exigir, executarAcao, type EstadoAcao } from "@/lib/auth";
import { criarGestor, criarSecretaria, definirSecretariaAtiva } from "@/lib/servicos/secretarias";

export async function acaoCriarSecretaria(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("admin");
  return executarAcao(async () => {
    const s = await criarSecretaria(ator, Object.fromEntries(f));
    revalidatePath("/admin");
    return { ok: `Secretaria "${s.nome}" criada. Link dos pacientes: /${s.slug}/entrar` };
  });
}

export async function acaoCriarGestor(secretariaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("admin");
  return executarAcao(async () => {
    const r = await criarGestor(ator, secretariaId, Object.fromEntries(f));
    revalidatePath(`/admin/secretarias/${secretariaId}`);
    return { ok: `Gestor ${r.gestor.nome} criado. Login: ${r.gestor.email}`, senhaProvisoria: r.senhaProvisoria };
  });
}

export async function acaoAlternarSecretaria(secretariaId: string, ativa: boolean) {
  const { ator } = await exigir("admin");
  await definirSecretariaAtiva(ator, secretariaId, ativa);
  revalidatePath(`/admin/secretarias/${secretariaId}`);
  revalidatePath("/admin");
}
