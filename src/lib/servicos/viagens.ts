/**
 * Viagens: o gestor cria a IDA e, opcionalmente, a VOLTA ligada a ela, com repetição semanal.
 * Regras:
 *  - não cria viagem no passado;
 *  - veículo e motorista precisam estar ativos;
 *  - o mesmo veículo/motorista não pode ter duas saídas com menos de 60 min de diferença no mesmo dia;
 *  - a volta precisa sair depois da ida;
 *  - o prazo de reserva não pode ser depois da saída.
 * Horários são de Brasília (sem horário de verão desde 2019: -03:00).
 */
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import { ErroNegocio } from "../erros";
import { TIPOS_RESERVAVEIS } from "../layouts";
import { type Ator, exigirPapel, secretariaDoAtor } from "../permissoes";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const FUSO = "America/Sao_Paulo";
export const INTERVALO_MIN_MINUTOS = 60;
export const MAX_REPETICOES = 60;

/** Momento da saída (timestamptz) calculado no banco. */
export const PARTIDA = sql`((${schema.viagens.data} + ${schema.viagens.saida}) at time zone 'America/Sao_Paulo')`;

/** Data de hoje em Brasília (AAAA-MM-DD). */
export function hojeBr(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Converte data + hora de Brasília em Date. */
export function momentoBr(data: string, hora: string): Date {
  return new Date(`${data}T${hora.slice(0, 5)}:00-03:00`);
}

export function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
export const horaBr = (t: string) => t.slice(0, 5);

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, "Horário inválido.");
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const opcional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());
const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const criarSchema = z
  .object({
    veiculoId: z.uuid("Escolha o veículo."),
    motoristaId: opcional(z.uuid()),
    data: dataIso,
    saida: hora,
    cidadeOrigem: z.string().trim().min(2, "Informe a cidade de origem."),
    cidadeDestino: z.string().trim().min(2, "Informe a cidade de destino."),
    reservasAte: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Prazo de reserva inválido.")),
    observacoes: opcional(z.string().trim().max(500)),
    comVolta: bool,
    voltaSaida: opcional(hora),
    voltaDiasDepois: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0).max(30)),
    voltaVeiculoId: opcional(z.uuid()),
    voltaMotoristaId: opcional(z.uuid()),
    repetir: bool,
    repetirDias: z.preprocess(
      (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
      z.array(z.enum(DIAS_SEMANA)).default([]),
    ),
    repetirAte: opcional(dataIso),
  })
  .superRefine((v, ctx) => {
    if (v.cidadeOrigem.toLowerCase() === v.cidadeDestino.toLowerCase())
      ctx.addIssue({ code: "custom", message: "Origem e destino precisam ser cidades diferentes." });
    if (v.comVolta && !v.voltaSaida) ctx.addIssue({ code: "custom", message: "Informe o horário de saída da volta." });
    if (v.repetir && (!v.repetirAte || v.repetirDias.length === 0))
      ctx.addIssue({ code: "custom", message: "Para repetir, escolha os dias da semana e a data final." });
  });

export type DadosNovaViagem = z.input<typeof criarSchema>;

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Datas da viagem: a primeira + as repetições nos dias da semana escolhidos, até a data final. */
export function datasDaRepeticao(inicio: string, dias: readonly string[], ate: string): string[] {
  const datas = [inicio];
  for (let d = somarDias(inicio, 1); d <= ate; d = somarDias(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dias.includes(DIAS_SEMANA[dow])) datas.push(d);
    if (datas.length > MAX_REPETICOES) break;
  }
  return datas;
}

async function conferirRecursos(tx: Tx, secretariaId: string, veiculoId: string, motoristaId?: string) {
  const [v] = await tx
    .select({ ativo: schema.veiculos.ativo, nome: schema.veiculos.nome })
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.id, veiculoId), eq(schema.veiculos.secretariaId, secretariaId)));
  if (!v) throw new ErroNegocio("Veículo não encontrado.");
  if (!v.ativo) throw new ErroNegocio(`O veículo ${v.nome} está inativo.`);
  if (motoristaId) {
    const [m] = await tx
      .select({ ativo: schema.motoristas.ativo, nome: schema.motoristas.nome })
      .from(schema.motoristas)
      .where(and(eq(schema.motoristas.id, motoristaId), eq(schema.motoristas.secretariaId, secretariaId)));
    if (!m) throw new ErroNegocio("Motorista não encontrado.");
    if (!m.ativo) throw new ErroNegocio(`O motorista ${m.nome} está inativo.`);
  }
}

/** Procura outra viagem do mesmo veículo ou motorista saindo com menos de 60 min de diferença. */
async function conferirConflito(
  tx: Tx,
  secretariaId: string,
  p: { data: string; saida: string; veiculoId: string; motoristaId?: string | null; ignorarId?: string },
) {
  const v = schema.viagens;
  const recurso = p.motoristaId
    ? sql`(${v.veiculoId} = ${p.veiculoId} or ${v.motoristaId} = ${p.motoristaId})`
    : sql`${v.veiculoId} = ${p.veiculoId}`;
  const [c] = await tx
    .select({ saida: v.saida, veiculoId: v.veiculoId, cidadeDestino: v.cidadeDestino })
    .from(v)
    .where(
      and(
        eq(v.secretariaId, secretariaId),
        eq(v.data, p.data),
        ne(v.status, "cancelada"),
        p.ignorarId ? ne(v.id, p.ignorarId) : undefined,
        recurso,
        sql`abs(extract(epoch from (${v.saida} - ${p.saida}::time))) < ${INTERVALO_MIN_MINUTOS * 60}`,
      ),
    )
    .limit(1);
  if (c) {
    const quem = c.veiculoId === p.veiculoId ? "Este veículo" : "Este motorista";
    throw new ErroNegocio(
      `${quem} já tem viagem em ${dataBr(p.data)} às ${horaBr(c.saida)} (para ${c.cidadeDestino}). Deixe pelo menos ${INTERVALO_MIN_MINUTOS} minutos entre as saídas.`,
    );
  }
}

/** Prazo de reserva padrão: o informado, aplicado com o mesmo deslocamento em cada repetição. */
function prazoPara(data: string, saida: string, base: z.infer<typeof criarSchema>): Date | null {
  if (!base.reservasAte) return null;
  const prazoBase = new Date(`${base.reservasAte}:00-03:00`);
  const partidaBase = momentoBr(base.data, base.saida);
  const antecedencia = partidaBase.getTime() - prazoBase.getTime();
  return new Date(momentoBr(data, saida).getTime() - antecedencia);
}

export async function criarViagens(ator: Ator, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const r = criarSchema.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  const v = r.data;

  if (v.data < hojeBr()) throw new ErroNegocio("Não é possível criar viagem em data passada.");
  if (momentoBr(v.data, v.saida) <= new Date()) throw new ErroNegocio("O horário de saída já passou.");
  if (v.reservasAte && new Date(`${v.reservasAte}:00-03:00`) > momentoBr(v.data, v.saida))
    throw new ErroNegocio("O prazo para reservar não pode ser depois da saída.");
  if (v.comVolta && v.voltaDiasDepois === 0) {
    if (v.voltaSaida! <= v.saida) throw new ErroNegocio("A volta precisa sair depois da ida.");
    const mesmoRecurso = (v.voltaVeiculoId ?? v.veiculoId) === v.veiculoId || (!!v.motoristaId && (v.voltaMotoristaId ?? v.motoristaId) === v.motoristaId);
    const minutos = (momentoBr(v.data, v.voltaSaida!).getTime() - momentoBr(v.data, v.saida).getTime()) / 60000;
    if (mesmoRecurso && minutos < INTERVALO_MIN_MINUTOS)
      throw new ErroNegocio(`Com o mesmo veículo ou motorista, a volta precisa sair pelo menos ${INTERVALO_MIN_MINUTOS} minutos depois da ida.`);
  }

  const datas = v.repetir ? datasDaRepeticao(v.data, v.repetirDias, v.repetirAte!) : [v.data];
  if (datas.length > MAX_REPETICOES) throw new ErroNegocio(`Máximo de ${MAX_REPETICOES} viagens por vez. Reduza o período.`);

  const voltaVeiculo = v.voltaVeiculoId ?? v.veiculoId;
  const voltaMotorista = v.voltaMotoristaId ?? v.motoristaId;

  return db.transaction(async (tx) => {
    // um gestor de cada vez criando viagens na secretaria (evita conflito simultâneo)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"viagens:" + secretariaId}))`);
    await conferirRecursos(tx, secretariaId, v.veiculoId, v.motoristaId);
    if (v.comVolta) await conferirRecursos(tx, secretariaId, voltaVeiculo, voltaMotorista);

    const criadas: { ida: string; volta: string | null; data: string }[] = [];
    for (const data of datas) {
      await conferirConflito(tx, secretariaId, { data, saida: v.saida, veiculoId: v.veiculoId, motoristaId: v.motoristaId });
      const [ida] = await tx
        .insert(schema.viagens)
        .values({
          secretariaId, veiculoId: v.veiculoId, motoristaId: v.motoristaId ?? null, data, saida: v.saida, sentido: "ida",
          cidadeOrigem: v.cidadeOrigem, cidadeDestino: v.cidadeDestino, reservasAte: prazoPara(data, v.saida, v), observacoes: v.observacoes ?? null,
        })
        .returning({ id: schema.viagens.id });
      let voltaId: string | null = null;
      if (v.comVolta) {
        const dataVolta = somarDias(data, v.voltaDiasDepois);
        await conferirConflito(tx, secretariaId, { data: dataVolta, saida: v.voltaSaida!, veiculoId: voltaVeiculo, motoristaId: voltaMotorista });
        const [volta] = await tx
          .insert(schema.viagens)
          .values({
            secretariaId, veiculoId: voltaVeiculo, motoristaId: voltaMotorista ?? null, data: dataVolta, saida: v.voltaSaida!, sentido: "volta",
            cidadeOrigem: v.cidadeDestino, cidadeDestino: v.cidadeOrigem, viagemParId: ida.id, observacoes: v.observacoes ?? null,
            reservasAte: prazoPara(data, v.saida, v), // a volta segue o mesmo prazo da ida
          })
          .returning({ id: schema.viagens.id });
        await tx.update(schema.viagens).set({ viagemParId: volta.id }).where(eq(schema.viagens.id, ida.id));
        voltaId = volta.id;
      }
      criadas.push({ ida: ida.id, volta: voltaId, data });
    }
    await tx.insert(schema.auditoria).values({
      acao: "viagem.criar", usuarioId: ator.id, secretariaId, entidade: "viagem", entidadeId: criadas[0].ida,
      dados: { quantidade: criadas.length, comVolta: v.comVolta },
    });
    return criadas;
  });
}

const veiculoVolta = alias(schema.veiculos, "veiculo_volta");

/** Lista de viagens da secretaria com ocupação (vagas e reservas ativas). */
export async function listarViagens(ator: Ator, filtro: { de?: string; ate?: string; incluirCanceladas?: boolean } = {}) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const v = schema.viagens;
  return db
    .select({
      viagem: v,
      veiculo: { nome: schema.veiculos.nome, tipo: schema.veiculos.tipo, placa: schema.veiculos.placa },
      motorista: schema.motoristas.nome,
      vagas: sql<number>`(select count(*)::int from assentos a where a.veiculo_id = ${v.veiculoId} and a.ativo and a.tipo in ('comum','preferencial','cadeirante'))`,
      ocupadas: sql<number>`(select count(*)::int from reservas r where r.viagem_id = ${v.id} and r.status <> 'cancelada')`,
    })
    .from(v)
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, v.veiculoId))
    .leftJoin(schema.motoristas, eq(schema.motoristas.id, v.motoristaId))
    .where(
      and(
        eq(v.secretariaId, secretariaId),
        filtro.de ? gte(v.data, filtro.de) : undefined,
        filtro.ate ? lte(v.data, filtro.ate) : undefined,
        filtro.incluirCanceladas ? undefined : ne(v.status, "cancelada"),
      ),
    )
    .orderBy(asc(v.data), asc(v.saida))
    .limit(500);
}

/** Viagem da secretaria do ator (gestor ou paciente), com veículo, motorista e par. */
export async function obterViagem(ator: Ator, id: string) {
  exigirPapel(ator, "gestor", "paciente");
  const secretariaId = secretariaDoAtor(ator);
  if (!z.uuid().safeParse(id).success) return null;
  const par = alias(schema.viagens, "par");
  const [r] = await db
    .select({ viagem: schema.viagens, veiculo: schema.veiculos, motorista: schema.motoristas, par, veiculoPar: veiculoVolta })
    .from(schema.viagens)
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, schema.viagens.veiculoId))
    .leftJoin(schema.motoristas, eq(schema.motoristas.id, schema.viagens.motoristaId))
    .leftJoin(par, eq(par.id, schema.viagens.viagemParId))
    .leftJoin(veiculoVolta, eq(veiculoVolta.id, par.veiculoId))
    .where(and(eq(schema.viagens.id, id), eq(schema.viagens.secretariaId, secretariaId)));
  return r ?? null;
}

const editarSchema = z.object({
  motoristaId: opcional(z.uuid()),
  saida: hora,
  reservasAte: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Prazo de reserva inválido.")),
  observacoes: opcional(z.string().trim().max(500)),
});

/** Edita motorista, horário, prazo e observações. (Trocar o veículo exige remanejar os passageiros.) */
export async function editarViagem(ator: Ator, id: string, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const r = editarSchema.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  const e = r.data;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"viagens:" + secretariaId}))`);
    const [via] = await tx
      .select()
      .from(schema.viagens)
      .where(and(eq(schema.viagens.id, id), eq(schema.viagens.secretariaId, secretariaId)));
    if (!via) throw new ErroNegocio("Viagem não encontrada.");
    if (via.status === "cancelada" || via.status === "concluida") throw new ErroNegocio("Viagem cancelada ou concluída não pode ser alterada.");
    if (e.motoristaId) await conferirRecursos(tx, secretariaId, via.veiculoId, e.motoristaId);
    await conferirConflito(tx, secretariaId, { data: via.data, saida: e.saida, veiculoId: via.veiculoId, motoristaId: e.motoristaId, ignorarId: id });
    const prazo = e.reservasAte ? new Date(`${e.reservasAte}:00-03:00`) : null;
    if (prazo && prazo > momentoBr(via.data, e.saida)) throw new ErroNegocio("O prazo para reservar não pode ser depois da saída.");
    if (via.viagemParId) {
      const [par] = await tx.select().from(schema.viagens).where(eq(schema.viagens.id, via.viagemParId));
      if (par) {
        const ida = via.sentido === "ida" ? { data: via.data, saida: e.saida } : par;
        const volta = via.sentido === "volta" ? { data: via.data, saida: e.saida } : par;
        if (momentoBr(volta.data, volta.saida) <= momentoBr(ida.data, ida.saida))
          throw new ErroNegocio("A volta precisa sair depois da ida.");
      }
    }
    await tx
      .update(schema.viagens)
      .set({ motoristaId: e.motoristaId ?? null, saida: e.saida, reservasAte: prazo, observacoes: e.observacoes ?? null })
      .where(eq(schema.viagens.id, id));
    await tx.insert(schema.auditoria).values({ acao: "viagem.editar", usuarioId: ator.id, secretariaId, entidade: "viagem", entidadeId: id });
  });
}

/** Abrir/fechar reservas manualmente, ou concluir a viagem. */
export async function definirStatusViagem(ator: Ator, id: string, status: "aberta" | "fechada" | "concluida") {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const [via] = await db
    .select()
    .from(schema.viagens)
    .where(and(eq(schema.viagens.id, id), eq(schema.viagens.secretariaId, secretariaId)));
  if (!via) throw new ErroNegocio("Viagem não encontrada.");
  if (via.status === "cancelada") throw new ErroNegocio("Viagem cancelada não pode mudar de situação.");
  if (status === "concluida" && via.data > hojeBr()) throw new ErroNegocio("Só é possível concluir a viagem no dia dela ou depois.");
  await db.update(schema.viagens).set({ status }).where(eq(schema.viagens.id, id));
  await db.insert(schema.auditoria).values({ acao: `viagem.${status}`, usuarioId: ator.id, secretariaId, entidade: "viagem", entidadeId: id });
}

/** Cancela a viagem e todas as reservas dela. Devolve quantos passageiros precisam ser avisados. */
export async function cancelarViagem(ator: Ator, id: string, motivo: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (motivo.trim().length < 3) throw new ErroNegocio("Informe o motivo do cancelamento.");
  return db.transaction(async (tx) => {
    const [via] = await tx
      .select()
      .from(schema.viagens)
      .where(and(eq(schema.viagens.id, id), eq(schema.viagens.secretariaId, secretariaId)))
      .for("update");
    if (!via) throw new ErroNegocio("Viagem não encontrada.");
    if (via.status === "concluida") throw new ErroNegocio("Viagem concluída não pode ser cancelada.");
    if (via.status === "cancelada") throw new ErroNegocio("Esta viagem já está cancelada.");
    const afetadas = await tx
      .update(schema.reservas)
      .set({ status: "cancelada", canceladoEm: new Date() })
      .where(and(eq(schema.reservas.viagemId, id), ne(schema.reservas.status, "cancelada")))
      .returning({ id: schema.reservas.id });
    const obs = [via.observacoes, `Cancelada: ${motivo.trim()}`].filter(Boolean).join(" · ");
    await tx.update(schema.viagens).set({ status: "cancelada", observacoes: obs }).where(eq(schema.viagens.id, id));
    await tx.insert(schema.auditoria).values({
      acao: "viagem.cancelar", usuarioId: ator.id, secretariaId, entidade: "viagem", entidadeId: id, dados: { motivo, reservasCanceladas: afetadas.length },
    });
    return { reservasCanceladas: afetadas.length };
  });
}

/** Assentos ativos do veículo de cada viagem, em ordem de mapa. */
export async function assentosDosVeiculos(veiculoIds: string[]) {
  if (!veiculoIds.length) return [];
  return db
    .select()
    .from(schema.assentos)
    .where(and(inArray(schema.assentos.veiculoId, veiculoIds), eq(schema.assentos.ativo, true)))
    .orderBy(asc(schema.assentos.linha), asc(schema.assentos.coluna));
}

export const ehReservavel = (tipo: string) => (TIPOS_RESERVAVEIS as string[]).includes(tipo);
