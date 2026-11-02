"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigir, executarAcao, type EstadoAcao } from "@/lib/auth";
import {
  atualizarVeiculo, criarMotorista, criarVeiculo, definirMotoristaAtivo, definirVeiculoAtivo, salvarLayout,
} from "@/lib/servicos/frota";

export async function acaoCriarVeiculo(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  let id = "";
  const r = await executarAcao(async () => {
    id = (await criarVeiculo(ator, Object.fromEntries(f))).id;
    return null;
  });
  if (id) {
    revalidatePath("/gestor/frota");
    redirect(`/gestor/frota/${id}?novo=1`);
  }
  return r;
}

export async function acaoAtualizarVeiculo(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await atualizarVeiculo(ator, id, Object.fromEntries(f));
    revalidatePath(`/gestor/frota/${id}`);
    revalidatePath("/gestor/frota");
    return { ok: "Dados do veículo salvos." };
  });
}

export async function acaoSalvarLayout(id: string, layout: unknown): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    const r = await salvarLayout(ator, id, layout);
    revalidatePath(`/gestor/frota/${id}`);
    revalidatePath("/gestor/frota");
    return { ok: `Mapa salvo: ${r.vagas} vaga(s) para passageiros e ${r.equipe} da equipe.` };
  });
}

export async function acaoAlternarVeiculo(id: string, ativo: boolean, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await definirVeiculoAtivo(ator, id, ativo);
    revalidatePath(`/gestor/frota/${id}`);
    revalidatePath("/gestor/frota");
    return { ok: ativo ? "Veículo reativado." : "Veículo inativado." };
  });
}

export async function acaoCriarMotorista(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    const m = await criarMotorista(ator, Object.fromEntries(f));
    revalidatePath("/gestor/motoristas");
    return { ok: `Motorista ${m.nome} cadastrado.` };
  });
}

export async function acaoAlternarMotorista(id: string, ativo: boolean, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await definirMotoristaAtivo(ator, id, ativo);
    revalidatePath("/gestor/motoristas");
    return null;
  });
}
