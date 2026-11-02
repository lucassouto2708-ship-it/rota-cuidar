/**
 * Reservas de assento.
 *  - Paciente reserva para si (e um acompanhante), na ida e opcionalmente na volta, numa única operação:
 *    ou tudo é reservado, ou nada.
 *  - Gestor reserva em nome de qualquer paciente da secretaria (inclusive após o prazo), troca de
 *    assento, cancela e marca presença no embarque.
 *  - Assento duplicado é barrado pelo banco (índice único), mesmo com cliques simultâneos.
 *  - Paciente nunca vê o nome de outros passageiros, só se o assento está livre ou ocupado.
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Assento } from "@/db/schema";
import { ErroNegocio, ErroPermissao } from "../erros";
import { type Ator, exigirPapel, secretariaDoAtor } from "../permissoes";
import { dataBr, ehReservavel, hojeBr, horaBr, momentoBr, PARTIDA } from "./viagens";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Viagem = typeof schema.viagens.$inferSelect;

const opcional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

const trechoSchema = z.object({
  viagemId: z.uuid(),
  assentoId: z.uuid("Escolha o seu assento."),
  acompanhanteAssentoId: opcional(z.uuid()),
});

const reservaSchema = z
  .object({
    pacienteId: opcional(z.uuid()), // só o gestor informa
    ida: trechoSchema,
    volta: trechoSchema.optional(),
    acompanhanteNome: opcional(z.string().trim().min(3, "Informe o nome completo do acompanhante.").max(120)),
    acompanhanteDocumento: opcional(z.string().trim().max(30)),
    pontoEmbarque: opcional(z.string().trim().max(200)),
    localDestino: opcional(z.string().trim().max(200)),
    horarioCompromisso: opcional(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário do compromisso inválido.")),
  })
  .superRefine((v, ctx) => {
    const temAcomp = !!v.ida.acompanhanteAssentoId || !!v.volta?.acompanhanteAssentoId;
    if (temAcomp && !v.acompanhanteNome) ctx.addIssue({ code: "custom", message: "Informe o nome do acompanhante." });
    if (v.acompanhanteNome && !v.ida.acompanhanteAssentoId && !v.volta?.acompanhanteAssentoId)
      ctx.addIssue({ code: "custom", message: "Escolha o assento do acompanhante." });
    for (const t of [v.ida, v.volta])
      if (t && t.acompanhanteAssentoId === t.assentoId)
        ctx.addIssue({ code: "custom", message: "Paciente e acompanhante precisam de assentos diferentes." });
  });

export type DadosReserva = z.input<typeof reservaSchema>;

const MSG_UNICIDADE: Record<string, string> = {
  reservas_assento_ativo_uk: "Este assento acabou de ser reservado por outra pessoa. Escolha outro.",
  reservas_paciente_ativo_uk: "Este paciente já tem reserva nesta viagem.",
};

function traduzir(e: unknown): never {
  const c = (e as { cause?: { code?: string; constraint?: string }; code?: string; constraint?: string });
  const code = c.cause?.code ?? c.code;
  const constraint = c.cause?.constraint ?? c.constraint;
  if (code === "23505" && constraint && MSG_UNICIDADE[constraint]) throw new ErroNegocio(MSG_UNICIDADE[constraint]);
  throw e;
}

/** Pode reservar nesta viagem agora? Gestor ignora o prazo e reserva com a viagem "fechada". */
export function motivoBloqueio(v: Viagem, papel: Ator["papel"], agora = new Date()): string | null {
  const quando = `${dataBr(v.data)} às ${horaBr(v.saida)}`;
  if (v.status === "cancelada") return `A viagem de ${quando} foi cancelada.`;
  if (v.status === "concluida" || v.status === "em_andamento") return `A viagem de ${quando} já saiu.`;
  if (momentoBr(v.data, v.saida) <= agora) return `A viagem de ${quando} já saiu.`;
  if (papel === "gestor") return null;
  if (v.status === "fechada") return `As reservas da viagem de ${quando} estão encerradas.`;
  if (v.reservasAte && v.reservasAte <= agora) return `O prazo para reservar a viagem de ${quando} terminou.`;
  return null;
}

async function carregarViagem(tx: Tx, secretariaId: string, id: string) {
  const [v] = await tx
    .select()
    .from(schema.viagens)
    .where(and(eq(schema.viagens.id, id), eq(schema.viagens.secretariaId, secretariaId)));
  if (!v) throw new ErroNegocio("Viagem não encontrada.");
  return v;
}

async function conferirAssento(tx: Tx, viagem: Viagem, assentoId: string) {
  const [a] = await tx
    .select()
    .from(schema.assentos)
    .where(and(eq(schema.assentos.id, assentoId), eq(schema.assentos.veiculoId, viagem.veiculoId), eq(schema.assentos.ativo, true)));
  if (!a || !ehReservavel(a.tipo)) throw new ErroNegocio("Assento indisponível nesta viagem. Escolha outro.");
  return a;
}

export async function reservar(ator: Ator, dados: unknown) {
  exigirPapel(ator, "paciente", "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const r = reservaSchema.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  const d = r.data;

  let pacienteId: string;
  if (ator.papel === "paciente") {
    if (d.pacienteId && d.pacienteId !== ator.id) throw new ErroPermissao();
    pacienteId = ator.id;
  } else {
    if (!d.pacienteId) throw new ErroNegocio("Escolha o paciente.");
    pacienteId = d.pacienteId;
  }

  try {
    return await db.transaction(async (tx) => {
      const [pac] = await tx
        .select()
        .from(schema.usuarios)
        .where(and(eq(schema.usuarios.id, pacienteId), eq(schema.usuarios.secretariaId, secretariaId), eq(schema.usuarios.papel, "paciente")));
      if (!pac) throw new ErroNegocio("Paciente não encontrado.");
      if (!pac.ativo) throw new ErroNegocio("Cadastro do paciente está desativado.");

      const ida = await carregarViagem(tx, secretariaId, d.ida.viagemId);
      const trechos: { viagem: Viagem; t: z.infer<typeof trechoSchema> }[] = [{ viagem: ida, t: d.ida }];
      if (d.volta) {
        const volta = await carregarViagem(tx, secretariaId, d.volta.viagemId);
        if (ida.viagemParId !== volta.id || volta.sentido !== "volta") throw new ErroNegocio("A volta escolhida não pertence a esta ida.");
        trechos.push({ viagem: volta, t: d.volta });
      }

      const criadas: string[] = [];
      for (const { viagem, t } of trechos) {
        const bloqueio = motivoBloqueio(viagem, ator.papel);
        if (bloqueio) throw new ErroNegocio(bloqueio);
        await conferirAssento(tx, viagem, t.assentoId);
        if (t.acompanhanteAssentoId) await conferirAssento(tx, viagem, t.acompanhanteAssentoId);

        // mesmo paciente em outra viagem no mesmo dia e sentido
        const [outra] = await tx
          .select({ saida: schema.viagens.saida, destino: schema.viagens.cidadeDestino })
          .from(schema.reservas)
          .innerJoin(schema.viagens, eq(schema.viagens.id, schema.reservas.viagemId))
          .where(
            and(
              eq(schema.reservas.pacienteId, pacienteId),
              eq(schema.reservas.tipoPassageiro, "paciente"),
              ne(schema.reservas.status, "cancelada"),
              eq(schema.viagens.data, viagem.data),
              eq(schema.viagens.sentido, viagem.sentido),
              ne(schema.viagens.id, viagem.id),
              ne(schema.viagens.status, "cancelada"),
            ),
          )
          .limit(1);
        if (outra)
          throw new ErroNegocio(
            `${ator.papel === "paciente" ? "Você já tem" : "O paciente já tem"} reserva de ${viagem.sentido} em ${dataBr(viagem.data)} (saída ${horaBr(outra.saida)} para ${outra.destino}).`,
          );

        const comuns = {
          secretariaId, viagemId: viagem.id, veiculoId: viagem.veiculoId, pacienteId, criadoPor: ator.id,
          pontoEmbarque: d.pontoEmbarque ?? null,
          localDestino: d.localDestino ?? null,
          horarioCompromisso: viagem.sentido === "ida" ? (d.horarioCompromisso ?? null) : null,
        };
        const [rp] = await tx.insert(schema.reservas).values({ ...comuns, assentoId: t.assentoId }).returning({ id: schema.reservas.id });
        criadas.push(rp.id);
        if (t.acompanhanteAssentoId) {
          const [ra] = await tx
            .insert(schema.reservas)
            .values({
              ...comuns, assentoId: t.acompanhanteAssentoId, tipoPassageiro: "acompanhante", acompanhanteDe: rp.id,
              nomeAcompanhante: d.acompanhanteNome!, documentoAcompanhante: d.acompanhanteDocumento ?? null,
            })
            .returning({ id: schema.reservas.id });
          criadas.push(ra.id);
        }
      }
      await tx.insert(schema.auditoria).values({
        acao: "reserva.criar", usuarioId: ator.id, secretariaId, entidade: "viagem", entidadeId: ida.id,
        dados: { pacienteId, reservas: criadas.length, volta: !!d.volta },
      });
      return { reservas: criadas };
    });
  } catch (e) {
    if (e instanceof ErroNegocio) throw e;
    traduzir(e);
  }
}

async function carregarReserva(tx: Tx, secretariaId: string, reservaId: string) {
  if (!z.uuid().safeParse(reservaId).success) throw new ErroNegocio("Reserva não encontrada.");
  const [r] = await tx
    .select({ reserva: schema.reservas, viagem: schema.viagens })
    .from(schema.reservas)
    .innerJoin(schema.viagens, eq(schema.viagens.id, schema.reservas.viagemId))
    .where(and(eq(schema.reservas.id, reservaId), eq(schema.reservas.secretariaId, secretariaId)));
  if (!r) throw new ErroNegocio("Reserva não encontrada.");
  return r;
}

/** Cancela a reserva (e o acompanhante ligado a ela). Paciente só a própria e antes da saída. */
export async function cancelarReserva(ator: Ator, reservaId: string) {
  exigirPapel(ator, "paciente", "gestor");
  const secretariaId = secretariaDoAtor(ator);
  return db.transaction(async (tx) => {
    const { reserva, viagem } = await carregarReserva(tx, secretariaId, reservaId);
    if (ator.papel === "paciente" && reserva.pacienteId !== ator.id) throw new ErroNegocio("Reserva não encontrada.");
    if (reserva.status === "cancelada") throw new ErroNegocio("Esta reserva já está cancelada.");
    if (viagem.status === "concluida") throw new ErroNegocio("A viagem já foi concluída.");
    if (ator.papel === "paciente" && momentoBr(viagem.data, viagem.saida) <= new Date())
      throw new ErroNegocio("A viagem já saiu. Fale com a secretaria de saúde.");
    const agora = new Date();
    const canceladas = await tx
      .update(schema.reservas)
      .set({ status: "cancelada", canceladoEm: agora })
      .where(
        and(
          ne(schema.reservas.status, "cancelada"),
          sql`(${schema.reservas.id} = ${reserva.id} or ${schema.reservas.acompanhanteDe} = ${reserva.id})`,
        ),
      )
      .returning({ id: schema.reservas.id });
    await tx.insert(schema.auditoria).values({
      acao: "reserva.cancelar", usuarioId: ator.id, secretariaId, entidade: "reserva", entidadeId: reserva.id, dados: { quantidade: canceladas.length },
    });
    return { canceladas: canceladas.length };
  });
}

/** Gestor troca o passageiro de assento na mesma viagem. */
export async function moverReserva(ator: Ator, reservaId: string, novoAssentoId: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  try {
    return await db.transaction(async (tx) => {
      const { reserva, viagem } = await carregarReserva(tx, secretariaId, reservaId);
      if (reserva.status === "cancelada") throw new ErroNegocio("Reserva cancelada.");
      if (viagem.status === "cancelada" || viagem.status === "concluida") throw new ErroNegocio("Viagem cancelada ou concluída.");
      if (!z.uuid().safeParse(novoAssentoId).success) throw new ErroNegocio("Escolha o novo assento.");
      await conferirAssento(tx, viagem, novoAssentoId);
      await tx.update(schema.reservas).set({ assentoId: novoAssentoId }).where(eq(schema.reservas.id, reserva.id));
      await tx.insert(schema.auditoria).values({
        acao: "reserva.mover", usuarioId: ator.id, secretariaId, entidade: "reserva", entidadeId: reserva.id, dados: { de: reserva.assentoId, para: novoAssentoId },
      });
    });
  } catch (e) {
    if (e instanceof ErroNegocio) throw e;
    traduzir(e);
  }
}

/** Gestor marca presença no embarque (no dia da viagem ou depois). null desfaz. */
export async function marcarEmbarque(ator: Ator, reservaId: string, embarque: "presente" | "faltou" | null) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (embarque !== null && embarque !== "presente" && embarque !== "faltou") throw new ErroNegocio("Opção inválida.");
  return db.transaction(async (tx) => {
    const { reserva, viagem } = await carregarReserva(tx, secretariaId, reservaId);
    if (reserva.status === "cancelada") throw new ErroNegocio("Reserva cancelada.");
    if (viagem.status === "cancelada") throw new ErroNegocio("Viagem cancelada.");
    if (viagem.data > hojeBr()) throw new ErroNegocio("A presença só pode ser marcada no dia da viagem.");
    await tx
      .update(schema.reservas)
      .set({ embarque, embarqueMarcadoPor: embarque ? ator.id : null, embarqueEm: embarque ? new Date() : null })
      .where(eq(schema.reservas.id, reserva.id));
    await tx.insert(schema.auditoria).values({
      acao: "reserva.embarque", usuarioId: ator.id, secretariaId, entidade: "reserva", entidadeId: reserva.id, dados: { embarque },
    });
  });
}

// ───────────────────────── Consultas ─────────────────────────

export type EstadoAssento = "livre" | "ocupado" | "meu" | "indisponivel";
export type AssentoNaViagem = Pick<Assento, "id" | "linha" | "coluna" | "rotulo" | "tipo"> & {
  estado: EstadoAssento;
  /** Só para o gestor */
  passageiro?: { reservaId: string; nome: string; acompanhante: boolean; embarque: "presente" | "faltou" | null };
};

/** Mapa de ocupação. Para o paciente, sem nomes de terceiros. */
export async function mapaDaViagem(ator: Ator, viagemId: string) {
  exigirPapel(ator, "paciente", "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (!z.uuid().safeParse(viagemId).success) return null;
  const [viagem] = await db
    .select({ viagem: schema.viagens, veiculo: schema.veiculos })
    .from(schema.viagens)
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, schema.viagens.veiculoId))
    .where(and(eq(schema.viagens.id, viagemId), eq(schema.viagens.secretariaId, secretariaId)));
  if (!viagem) return null;
  const assentos = await db
    .select()
    .from(schema.assentos)
    .where(and(eq(schema.assentos.veiculoId, viagem.veiculo.id), eq(schema.assentos.ativo, true)))
    .orderBy(asc(schema.assentos.linha), asc(schema.assentos.coluna));
  const ocupacao = await db
    .select({ reserva: schema.reservas, nomePaciente: schema.usuarios.nome })
    .from(schema.reservas)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.reservas.pacienteId))
    .where(and(eq(schema.reservas.viagemId, viagemId), ne(schema.reservas.status, "cancelada")));
  const porAssento = new Map(ocupacao.map((o) => [o.reserva.assentoId, o]));
  const gestor = ator.papel === "gestor";
  const lista: AssentoNaViagem[] = assentos.map((a) => {
    const o = porAssento.get(a.id);
    const base = { id: a.id, linha: a.linha, coluna: a.coluna, rotulo: a.rotulo, tipo: a.tipo };
    if (!ehReservavel(a.tipo)) return { ...base, estado: "indisponivel" };
    if (!o) return { ...base, estado: "livre" };
    const meu = !gestor && o.reserva.pacienteId === ator.id;
    return {
      ...base,
      estado: meu ? "meu" : "ocupado",
      ...(gestor
        ? {
            passageiro: {
              reservaId: o.reserva.id,
              nome: o.reserva.tipoPassageiro === "acompanhante" ? `${o.reserva.nomeAcompanhante} (acomp. de ${o.nomePaciente})` : o.nomePaciente,
              acompanhante: o.reserva.tipoPassageiro === "acompanhante",
              embarque: o.reserva.embarque,
            },
          }
        : {}),
    };
  });
  const livres = lista.filter((a) => a.estado === "livre").length;
  return {
    viagem: viagem.viagem,
    veiculo: { id: viagem.veiculo.id, nome: viagem.veiculo.nome, tipo: viagem.veiculo.tipo, linhas: viagem.veiculo.layoutLinhas, colunas: viagem.veiculo.layoutColunas, acessivel: viagem.veiculo.acessivel },
    assentos: lista,
    livres,
    bloqueio: motivoBloqueio(viagem.viagem, ator.papel),
  };
}

/** Viagens de IDA que o paciente pode reservar agora (com vagas livres na ida e na volta). */
export async function viagensDisponiveis(ator: Ator) {
  exigirPapel(ator, "paciente");
  const secretariaId = secretariaDoAtor(ator);
  const v = schema.viagens;
  const volta = alias(schema.viagens, "volta");
  const livres = (viagem: typeof v | typeof volta) =>
    sql<number>`((select count(*) from assentos a where a.veiculo_id = ${viagem.veiculoId} and a.ativo and a.tipo in ('comum','preferencial','cadeirante'))
      - (select count(*) from reservas r where r.viagem_id = ${viagem.id} and r.status <> 'cancelada'))::int`;
  return db
    .select({
      viagem: v,
      veiculo: { nome: schema.veiculos.nome, tipo: schema.veiculos.tipo, acessivel: schema.veiculos.acessivel },
      volta: { id: volta.id, data: volta.data, saida: volta.saida },
      livres: livres(v),
      livresVolta: sql<number | null>`case when ${volta.id} is null then null else ${livres(volta)} end`,
      jaReservada: sql<boolean>`exists (select 1 from reservas r where r.viagem_id = ${v.id} and r.paciente_id = ${ator.id} and r.status <> 'cancelada')`,
    })
    .from(v)
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, v.veiculoId))
    .leftJoin(volta, eq(volta.id, v.viagemParId))
    .where(
      and(
        eq(v.secretariaId, secretariaId),
        eq(v.sentido, "ida"),
        eq(v.status, "aberta"),
        sql`${PARTIDA} > now()`,
        sql`(${v.reservasAte} is null or ${v.reservasAte} > now())`,
      ),
    )
    .orderBy(asc(v.data), asc(v.saida))
    .limit(100);
}

/** Reservas do paciente (como paciente), com acompanhante e viagem. */
export async function minhasReservas(ator: Ator) {
  exigirPapel(ator, "paciente");
  const acomp = alias(schema.reservas, "acomp");
  const acompAssento = alias(schema.assentos, "acomp_assento");
  const linhas = await db
    .select({
      reserva: schema.reservas,
      assento: schema.assentos.rotulo,
      viagem: schema.viagens,
      veiculo: { nome: schema.veiculos.nome, placa: schema.veiculos.placa },
      motorista: schema.motoristas.nome,
      acompanhante: acomp.nomeAcompanhante,
      acompanhanteAssento: acompAssento.rotulo,
      jaSaiu: sql<boolean>`${PARTIDA} <= now()`,
    })
    .from(schema.reservas)
    .innerJoin(schema.viagens, eq(schema.viagens.id, schema.reservas.viagemId))
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, schema.reservas.veiculoId))
    .innerJoin(schema.assentos, eq(schema.assentos.id, schema.reservas.assentoId))
    .leftJoin(schema.motoristas, eq(schema.motoristas.id, schema.viagens.motoristaId))
    .leftJoin(acomp, and(eq(acomp.acompanhanteDe, schema.reservas.id), ne(acomp.status, "cancelada")))
    .leftJoin(acompAssento, eq(acompAssento.id, acomp.assentoId))
    .where(and(eq(schema.reservas.pacienteId, ator.id), eq(schema.reservas.tipoPassageiro, "paciente")))
    .orderBy(desc(schema.viagens.data), desc(schema.viagens.saida))
    .limit(100);
  const proximas = linhas.filter((l) => !l.jaSaiu && l.viagem.status !== "concluida").reverse();
  const anteriores = linhas.filter((l) => l.jaSaiu || l.viagem.status === "concluida");
  return { proximas, anteriores };
}

/** Pacientes ativos para o gestor escolher ao reservar. */
export async function pacientesParaReserva(ator: Ator) {
  exigirPapel(ator, "gestor");
  return db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, cpf: schema.usuarios.cpf })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.secretariaId, secretariaDoAtor(ator)), eq(schema.usuarios.papel, "paciente"), eq(schema.usuarios.ativo, true)))
    .orderBy(asc(schema.usuarios.nome));
}

// ───────────────────────── Lista de embarque ─────────────────────────

export type LinhaEmbarque = {
  reservaId: string;
  assento: string;
  nome: string;
  tipo: "paciente" | "acompanhante";
  acompanhanteDe: string | null;
  documento: string | null;
  cns: string | null;
  telefone: string | null;
  pontoEmbarque: string | null;
  localDestino: string | null;
  horarioCompromisso: string | null;
  embarque: "presente" | "faltou" | null;
  /** Para a ida: o passageiro também tem a volta reservada? */
  temOutroTrecho: boolean | null;
};

/** Passageiros de uma viagem (ativos), em ordem de assento, prontos para a lista/PDF. */
export async function listaEmbarque(ator: Ator, viagemId: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (!z.uuid().safeParse(viagemId).success) return null;
  const [cab] = await db
    .select({ viagem: schema.viagens, veiculo: schema.veiculos, motorista: schema.motoristas, secretaria: schema.secretarias })
    .from(schema.viagens)
    .innerJoin(schema.veiculos, eq(schema.veiculos.id, schema.viagens.veiculoId))
    .innerJoin(schema.secretarias, eq(schema.secretarias.id, schema.viagens.secretariaId))
    .leftJoin(schema.motoristas, eq(schema.motoristas.id, schema.viagens.motoristaId))
    .where(and(eq(schema.viagens.id, viagemId), eq(schema.viagens.secretariaId, secretariaId)));
  if (!cab) return null;
  const titular = alias(schema.usuarios, "titular");
  const parId = cab.viagem.viagemParId;
  const linhas = await db
    .select({ r: schema.reservas, assento: schema.assentos, pac: titular })
    .from(schema.reservas)
    .innerJoin(schema.assentos, eq(schema.assentos.id, schema.reservas.assentoId))
    .innerJoin(titular, eq(titular.id, schema.reservas.pacienteId))
    .where(and(eq(schema.reservas.viagemId, viagemId), ne(schema.reservas.status, "cancelada")))
    .orderBy(asc(schema.assentos.linha), asc(schema.assentos.coluna));
  // quem tem reserva ativa no outro trecho (ida↔volta)
  const noPar = new Set<string>();
  if (parId) {
    const outros = await db
      .select({ pacienteId: schema.reservas.pacienteId, tipo: schema.reservas.tipoPassageiro, nome: schema.reservas.nomeAcompanhante })
      .from(schema.reservas)
      .where(and(eq(schema.reservas.viagemId, parId), ne(schema.reservas.status, "cancelada")));
    for (const o of outros) noPar.add(o.tipo === "paciente" ? `p:${o.pacienteId}` : `a:${o.pacienteId}:${(o.nome ?? "").toLowerCase()}`);
  }
  const passageiros: LinhaEmbarque[] = linhas.map(({ r, assento, pac }) => {
    const ehAcomp = r.tipoPassageiro === "acompanhante";
    const chave = ehAcomp ? `a:${pac.id}:${(r.nomeAcompanhante ?? "").toLowerCase()}` : `p:${pac.id}`;
    return {
      reservaId: r.id,
      assento: assento.rotulo,
      nome: ehAcomp ? r.nomeAcompanhante! : pac.nome,
      tipo: r.tipoPassageiro,
      acompanhanteDe: ehAcomp ? pac.nome : null,
      documento: ehAcomp ? r.documentoAcompanhante : pac.cpf,
      cns: ehAcomp ? null : pac.cns,
      telefone: pac.telefone,
      pontoEmbarque: r.pontoEmbarque,
      localDestino: r.localDestino,
      horarioCompromisso: r.horarioCompromisso,
      embarque: r.embarque,
      temOutroTrecho: parId ? noPar.has(chave) : null,
    };
  });
  const resumo = {
    total: passageiros.length,
    presentes: passageiros.filter((p) => p.embarque === "presente").length,
    faltas: passageiros.filter((p) => p.embarque === "faltou").length,
    pendentes: passageiros.filter((p) => !p.embarque).length,
  };
  return { ...cab, passageiros, resumo };
}
