"use server";
import { revalidatePath } from "next/cache";
import { exigir, executarAcao, type EstadoAcao } from "@/lib/auth";
import { formatarCpf } from "@/lib/cpf";
import { criarPaciente, definirPacienteAtivo, redefinirSenhaPaciente } from "@/lib/servicos/usuarios";

export async function acaoCriarPaciente(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    const r = await criarPaciente(ator, Object.fromEntries(f));
    revalidatePath("/gestor/pacientes");
    return { ok: `Paciente ${r.paciente.nome} cadastrado. Login: CPF ${formatarCpf(r.paciente.cpf!)}`, senhaProvisoria: r.senhaProvisoria };
  });
}

export async function acaoRedefinirSenha(pacienteId: string, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    const r = await redefinirSenhaPaciente(ator, pacienteId);
    return { ok: "Nova senha gerada.", senhaProvisoria: r.senhaProvisoria };
  });
}

export async function acaoAlternarPaciente(pacienteId: string, ativo: boolean) {
  const { ator } = await exigir("gestor");
  await definirPacienteAtivo(ator, pacienteId, ativo);
  revalidatePath("/gestor/pacientes");
}
