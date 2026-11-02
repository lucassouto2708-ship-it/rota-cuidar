/** Textos de exibição compartilhados entre telas (sem acesso a banco). */
import type { mapaDaViagem } from "./servicos/reservas";
import { dataBr, horaBr } from "./servicos/viagens";

type ViagemBasica = { data: string; saida: string; sentido: "ida" | "volta"; cidadeOrigem: string; cidadeDestino: string };

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export function tituloViagem(v: ViagemBasica) {
  return `${v.sentido === "ida" ? "Ida" : "Volta"} · ${diaSemana(v.data)} ${dataBr(v.data)} às ${horaBr(v.saida)} · ${v.cidadeOrigem} → ${v.cidadeDestino}`;
}

export const NOME_STATUS_VIAGEM = {
  aberta: "Reservas abertas",
  fechada: "Reservas encerradas",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
} as const;

export function trechoParaForm(m: NonNullable<Awaited<ReturnType<typeof mapaDaViagem>>>) {
  return {
    viagemId: m.viagem.id,
    titulo: tituloViagem(m.viagem),
    linhas: m.veiculo.linhas,
    colunas: m.veiculo.colunas,
    assentos: m.assentos,
    bloqueio: m.bloqueio,
  };
}

/** "2026-11-12T18:00" (para input datetime-local) a partir de um Date, em Brasília. */
export function paraDatetimeLocal(d: Date | null) {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function dataHoraBr(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);
}
