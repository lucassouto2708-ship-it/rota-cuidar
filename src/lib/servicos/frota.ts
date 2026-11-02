/** Frota: veículos, mapa de assentos e motoristas. Somente o GESTOR, sempre na própria secretaria. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { TipoVeiculo } from "@/db/schema";
import { registrar } from "../auditoria";
import { soDigitos } from "../cpf";
import { ErroNegocio, traduzirErroBanco } from "../erros";
import { contarAssentos, layoutPadrao, NOME_TIPO_VEICULO, TIPOS_RESERVAVEIS, validarLayout, type Layout } from "../layouts";
import { type Ator, exigirPapel, secretariaDoAtor } from "../permissoes";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** "hoje" no fuso de Brasília, calculado pelo banco. */
const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;
const VIAGEM_PENDENTE = sql`${schema.viagens.status} in ('aberta','fechada','em_andamento') and ${schema.viagens.data} >= ${HOJE}`;

const tiposVeiculo = Object.keys(NOME_TIPO_VEICULO) as [TipoVeiculo, ...TipoVeiculo[]];

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). Guardada sem hífen, em maiúsculas. */
export function normalizarPlaca(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export const placaValida = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p);
export const formatarPlaca = (p: string | null) => (p && p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : (p ?? ""));

const veiculoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome/identificação do veículo."),
  tipo: z.enum(tiposVeiculo, "Tipo de veículo inválido."),
  placa: z
    .string()
    .optional()
    .transform((v) => (v ? normalizarPlaca(v) : ""))
    .refine((v) => v === "" || placaValida(v), "Placa inválida. Use o formato ABC-1234 ou ABC-1D23."),
  acessivel: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
});

function validar<T>(s: z.ZodType<T>, dados: unknown): T {
  const r = s.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

const layoutSchema = z.object({
  linhas: z.number().int(),
  colunas: z.number().int(),
  assentos: z
    .array(
      z.object({
        linha: z.number().int(),
        coluna: z.number().int(),
        rotulo: z.string().max(20),
        tipo: z.enum(["comum", "preferencial", "cadeirante", "equipe", "bloqueado"]),
      }),
    )
    .max(200),
});

const MSG_PLACA = { veiculos_secretaria_placa_uk: "Já existe um veículo com esta placa." };

// ───────────────────────── Veículos ─────────────────────────

export async function listarVeiculos(ator: Ator, { somenteAtivos = false } = {}) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const veiculos = await db
    .select()
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.secretariaId, secretariaId), somenteAtivos ? eq(schema.veiculos.ativo, true) : undefined))
    .orderBy(sql`${schema.veiculos.ativo} desc`, asc(schema.veiculos.nome));
  if (!veiculos.length) return [];
  const assentos = await db
    .select({ veiculoId: schema.assentos.veiculoId, tipo: schema.assentos.tipo })
    .from(schema.assentos)
    .where(and(inArray(schema.assentos.veiculoId, veiculos.map((v) => v.id)), eq(schema.assentos.ativo, true)));
  return veiculos.map((v) => ({ ...v, ...contarAssentos(assentos.filter((a) => a.veiculoId === v.id)) }));
}

/** Veículo da secretaria do gestor + assentos ativos. null se não existir ou for de outra secretaria. */
export async function obterVeiculo(ator: Ator, id: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (!z.uuid().safeParse(id).success) return null;
  const [v] = await db
    .select()
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.id, id), eq(schema.veiculos.secretariaId, secretariaId)));
  if (!v) return null;
  const assentos = await db
    .select()
    .from(schema.assentos)
    .where(and(eq(schema.assentos.veiculoId, v.id), eq(schema.assentos.ativo, true)))
    .orderBy(asc(schema.assentos.linha), asc(schema.assentos.coluna));
  return { ...v, assentos };
}

/** Cria o veículo já com o mapa de assentos do modelo do tipo escolhido. */
export async function criarVeiculo(ator: Ator, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const v = validar(veiculoSchema, dados);
  const layout = layoutPadrao(v.tipo);
  try {
    return await db.transaction(async (tx) => {
      const [veiculo] = await tx
        .insert(schema.veiculos)
        .values({
          secretariaId,
          nome: v.nome,
          tipo: v.tipo,
          placa: v.placa || null,
          acessivel: v.acessivel,
          layoutLinhas: layout.linhas,
          layoutColunas: layout.colunas,
        })
        .returning();
      await tx.insert(schema.assentos).values(layout.assentos.map((a) => ({ ...a, veiculoId: veiculo.id })));
      await registrarTx(tx, { acao: "veiculo.criar", usuarioId: ator.id, secretariaId, entidade: "veiculo", entidadeId: veiculo.id });
      return veiculo;
    });
  } catch (e) {
    traduzirErroBanco(e, MSG_PLACA);
  }
}

export async function atualizarVeiculo(ator: Ator, id: string, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const v = validar(veiculoSchema, dados);
  try {
    const [r] = await db
      .update(schema.veiculos)
      .set({ nome: v.nome, tipo: v.tipo, placa: v.placa || null, acessivel: v.acessivel })
      .where(and(eq(schema.veiculos.id, id), eq(schema.veiculos.secretariaId, secretariaId)))
      .returning();
    if (!r) throw new ErroNegocio("Veículo não encontrado.");
    await registrar({ acao: "veiculo.editar", usuarioId: ator.id, secretariaId, entidade: "veiculo", entidadeId: id });
    return r;
  } catch (e) {
    if (e instanceof ErroNegocio) throw e;
    traduzirErroBanco(e, MSG_PLACA);
  }
}

/** Inativar em vez de apagar: o histórico de viagens continua íntegro. */
export async function definirVeiculoAtivo(ator: Ator, id: string, ativo: boolean) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (!ativo) {
    const [pendente] = await db
      .select({ data: schema.viagens.data })
      .from(schema.viagens)
      .where(and(eq(schema.viagens.veiculoId, id), eq(schema.viagens.secretariaId, secretariaId), VIAGEM_PENDENTE))
      .orderBy(asc(schema.viagens.data))
      .limit(1);
    if (pendente)
      throw new ErroNegocio(`Este veículo tem viagem marcada para ${dataBr(pendente.data)}. Troque o veículo ou cancele a viagem antes de inativar.`);
  }
  const [r] = await db
    .update(schema.veiculos)
    .set({ ativo })
    .where(and(eq(schema.veiculos.id, id), eq(schema.veiculos.secretariaId, secretariaId)))
    .returning({ id: schema.veiculos.id });
  if (!r) throw new ErroNegocio("Veículo não encontrado.");
  await registrar({ acao: ativo ? "veiculo.ativar" : "veiculo.inativar", usuarioId: ator.id, secretariaId, entidade: "veiculo", entidadeId: id });
}

/**
 * Salva o mapa de assentos.
 * Os assentos são casados pela POSIÇÃO (fileira, coluna) para preservar reservas:
 *  - mesma posição → mantém o assento (mesmo id) e atualiza nome/tipo;
 *  - posição removida → apaga; se tiver reservas no histórico, só oculta (ativo = false);
 *  - assento com reserva em viagem futura não pode ser removido nem virar equipe/bloqueado.
 */
export async function salvarLayout(ator: Ator, veiculoId: string, layoutRecebido: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const formato = layoutSchema.safeParse(layoutRecebido);
  if (!formato.success) throw new ErroNegocio("Mapa de assentos em formato inválido.");
  const layout: Layout = formato.data;
  const erro = validarLayout(layout);
  if (erro) throw new ErroNegocio(erro);
  const novos = layout.assentos.map((a) => ({ ...a, rotulo: a.rotulo.trim() }));

  await db.transaction(async (tx) => {
    // trava o veículo para dois gestores não salvarem ao mesmo tempo
    const [veiculo] = await tx
      .select({ id: schema.veiculos.id })
      .from(schema.veiculos)
      .where(and(eq(schema.veiculos.id, veiculoId), eq(schema.veiculos.secretariaId, secretariaId)))
      .for("update");
    if (!veiculo) throw new ErroNegocio("Veículo não encontrado.");

    const atuais = await tx
      .select()
      .from(schema.assentos)
      .where(and(eq(schema.assentos.veiculoId, veiculoId), eq(schema.assentos.ativo, true)));
    const porPosicao = new Map(novos.map((a) => [`${a.linha},${a.coluna}`, a]));
    const mantidos = atuais.filter((a) => porPosicao.has(`${a.linha},${a.coluna}`));
    const removidos = atuais.filter((a) => !porPosicao.has(`${a.linha},${a.coluna}`));
    const posicoesAtuais = new Set(atuais.map((a) => `${a.linha},${a.coluna}`));
    const inseridos = novos.filter((a) => !posicoesAtuais.has(`${a.linha},${a.coluna}`));

    // assentos que deixam de aceitar passageiro (removidos ou virando equipe/bloqueado)
    const perdemVaga = [
      ...removidos,
      ...mantidos.filter((a) => !TIPOS_RESERVAVEIS.includes(porPosicao.get(`${a.linha},${a.coluna}`)!.tipo)),
    ];
    if (perdemVaga.length) {
      const [conflito] = await tx
        .select({ rotulo: schema.assentos.rotulo, data: schema.viagens.data })
        .from(schema.reservas)
        .innerJoin(schema.viagens, eq(schema.viagens.id, schema.reservas.viagemId))
        .innerJoin(schema.assentos, eq(schema.assentos.id, schema.reservas.assentoId))
        .where(
          and(
            inArray(schema.reservas.assentoId, perdemVaga.map((a) => a.id)),
            sql`${schema.reservas.status} <> 'cancelada'`,
            VIAGEM_PENDENTE,
          ),
        )
        .orderBy(asc(schema.viagens.data))
        .limit(1);
      if (conflito)
        throw new ErroNegocio(
          `O assento ${conflito.rotulo} tem passageiro reservado na viagem de ${dataBr(conflito.data)}. Troque o passageiro de lugar antes de remover ou bloquear este assento.`,
        );
    }

    // 1) tira do mapa os removidos (apaga, ou oculta se houver histórico)
    if (removidos.length) {
      const comHistorico = new Set(
        (
          await tx
            .selectDistinct({ id: schema.reservas.assentoId })
            .from(schema.reservas)
            .where(inArray(schema.reservas.assentoId, removidos.map((a) => a.id)))
        ).map((r) => r.id),
      );
      const ocultar = removidos.filter((a) => comHistorico.has(a.id)).map((a) => a.id);
      const apagar = removidos.filter((a) => !comHistorico.has(a.id)).map((a) => a.id);
      if (ocultar.length) await tx.update(schema.assentos).set({ ativo: false }).where(inArray(schema.assentos.id, ocultar));
      if (apagar.length) await tx.delete(schema.assentos).where(inArray(schema.assentos.id, apagar));
    }
    // 2) nomes temporários nos mantidos, para permitir trocar nomes entre assentos (ex.: renumerar)
    for (const a of mantidos)
      await tx.update(schema.assentos).set({ rotulo: `~${a.id}` }).where(eq(schema.assentos.id, a.id));
    // 3) nomes e tipos finais
    for (const a of mantidos) {
      const n = porPosicao.get(`${a.linha},${a.coluna}`)!;
      await tx.update(schema.assentos).set({ rotulo: n.rotulo, tipo: n.tipo }).where(eq(schema.assentos.id, a.id));
    }
    // 4) assentos novos
    if (inseridos.length) await tx.insert(schema.assentos).values(inseridos.map((a) => ({ ...a, veiculoId })));
    await tx
      .update(schema.veiculos)
      .set({ layoutLinhas: layout.linhas, layoutColunas: layout.colunas })
      .where(eq(schema.veiculos.id, veiculoId));
    await registrarTx(tx, {
      acao: "veiculo.layout",
      usuarioId: ator.id,
      secretariaId,
      entidade: "veiculo",
      entidadeId: veiculoId,
      dados: { ...contarAssentos(novos), inseridos: inseridos.length, removidos: removidos.length },
    });
  });
  return contarAssentos(novos);
}

// ───────────────────────── Motoristas ─────────────────────────

const motoristaSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo do motorista."),
  telefone: z.string().trim().optional(),
  cnh: z
    .string()
    .optional()
    .transform((v) => (v ? soDigitos(v) : ""))
    .refine((v) => v === "" || v.length === 11, "A CNH deve ter 11 dígitos."),
});

export async function listarMotoristas(ator: Ator, { somenteAtivos = false } = {}) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  return db
    .select()
    .from(schema.motoristas)
    .where(and(eq(schema.motoristas.secretariaId, secretariaId), somenteAtivos ? eq(schema.motoristas.ativo, true) : undefined))
    .orderBy(sql`${schema.motoristas.ativo} desc`, asc(schema.motoristas.nome));
}

export async function criarMotorista(ator: Ator, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const v = validar(motoristaSchema, dados);
  try {
    const [m] = await db
      .insert(schema.motoristas)
      .values({ secretariaId, nome: v.nome, telefone: v.telefone || null, cnh: v.cnh || null })
      .returning();
    await registrar({ acao: "motorista.criar", usuarioId: ator.id, secretariaId, entidade: "motorista", entidadeId: m.id });
    return m;
  } catch (e) {
    traduzirErroBanco(e, { motoristas_secretaria_cnh_uk: "Já existe um motorista com esta CNH." });
  }
}

export async function definirMotoristaAtivo(ator: Ator, id: string, ativo: boolean) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  if (!ativo) {
    const [pendente] = await db
      .select({ data: schema.viagens.data })
      .from(schema.viagens)
      .where(and(eq(schema.viagens.motoristaId, id), eq(schema.viagens.secretariaId, secretariaId), VIAGEM_PENDENTE))
      .orderBy(asc(schema.viagens.data))
      .limit(1);
    if (pendente) throw new ErroNegocio(`Este motorista está escalado na viagem de ${dataBr(pendente.data)}. Troque o motorista antes de inativar.`);
  }
  const [r] = await db
    .update(schema.motoristas)
    .set({ ativo })
    .where(and(eq(schema.motoristas.id, id), eq(schema.motoristas.secretariaId, secretariaId)))
    .returning({ id: schema.motoristas.id });
  if (!r) throw new ErroNegocio("Motorista não encontrado.");
  await registrar({ acao: ativo ? "motorista.ativar" : "motorista.inativar", usuarioId: ator.id, secretariaId, entidade: "motorista", entidadeId: id });
}

// ───────────────────────── util ─────────────────────────

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

async function registrarTx(tx: Tx, e: { acao: string; usuarioId: string; secretariaId: string; entidade: string; entidadeId: string; dados?: Record<string, unknown> }) {
  await tx.insert(schema.auditoria).values(e);
}
