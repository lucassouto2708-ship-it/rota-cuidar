"use server";
import { revalidatePath } from "next/cache";
import { exigir, executarAcao, type EstadoAcao } from "@/lib/auth";
import { cancelarReserva, reservar } from "@/lib/servicos/reservas";

export async function acaoReservar(dados: unknown): Promise<EstadoAcao> {
  const { ator } = await exigir("paciente");
  return executarAcao(async () => {
    await reservar(ator, dados);
    revalidatePath("/paciente");
    return { ok: "Reserva confirmada." };
  });
}

export async function acaoCancelarMinhaReserva(reservaId: string, _: EstadoAcao): Promise<EstadoAcao> {
  const { ator } = await exigir("paciente");
  return executarAcao(async () => {
    await cancelarReserva(ator, reservaId);
    revalidatePath("/paciente");
    return null;
  });
}
