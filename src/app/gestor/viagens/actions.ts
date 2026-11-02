"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigir, executarAcao, type EstadoAcao } from "@/lib/auth";
import { cancelarReserva, marcarEmbarque, moverReserva, reservar } from "@/lib/servicos/reservas";
import { cancelarViagem, criarViagens, definirStatusViagem, editarViagem } from "@/lib/servicos/viagens";

function formParaObjeto(f: FormData) {
  const o: Record<string, unknown> = Object.fromEntries(f);
  o.repetirDias = f.getAll("repetirDias");
  return o;
}

export async function acaoCriarViagens(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  let primeira = "";
  let total = 0;
  const r = await executarAcao(async () => {
    const criadas = await criarViagens(ator, formParaObjeto(f));
    primeira = criadas[0].ida;
    total = criadas.length;
    return null;
  });
  if (primeira) {
    revalidatePath("/gestor/viagens");
    redirect(total > 1 ? `/gestor/viagens?criadas=${total}` : `/gestor/viagens/${primeira}?nova=1`);
  }
  return r;
}

export async function acaoEditarViagem(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await editarViagem(ator, id, Object.fromEntries(f));
    revalidatePath(`/gestor/viagens/${id}`);
    return { ok: "Viagem atualizada." };
  });
}

export async function acaoStatusViagem(id: string, status: "aberta" | "fechada" | "concluida", _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await definirStatusViagem(ator, id, status);
    revalidatePath(`/gestor/viagens/${id}`);
    revalidatePath(`/gestor/viagens/${id}/lista`);
    return { ok: "Situação atualizada." };
  });
}

export async function acaoCancelarViagem(id: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    const r = await cancelarViagem(ator, id, String(f.get("motivo") ?? ""));
    revalidatePath(`/gestor/viagens/${id}`);
    revalidatePath("/gestor/viagens");
    return { ok: `Viagem cancelada. ${r.reservasCanceladas} reserva(s) cancelada(s): avise os passageiros.` };
  });
}

export async function acaoReservarPeloGestor(viagemId: string, dados: unknown): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await reservar(ator, dados);
    revalidatePath(`/gestor/viagens/${viagemId}`);
    return { ok: "Reserva feita." };
  });
}

export async function acaoCancelarReservaGestor(viagemId: string, reservaId: string, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await cancelarReserva(ator, reservaId);
    revalidatePath(`/gestor/viagens/${viagemId}`);
    return null;
  });
}

export async function acaoMoverReserva(viagemId: string, reservaId: string, _: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await moverReserva(ator, reservaId, String(f.get("assentoId") ?? ""));
    revalidatePath(`/gestor/viagens/${viagemId}`);
    return null;
  });
}

export async function acaoEmbarque(viagemId: string, reservaId: string, embarque: "presente" | "faltou" | null, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("gestor");
  return executarAcao(async () => {
    await marcarEmbarque(ator, reservaId, embarque);
    revalidatePath(`/gestor/viagens/${viagemId}/lista`);
    return null;
  });
}
