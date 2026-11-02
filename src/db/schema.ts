/**
 * Esquema do banco — Rota Cuidar (multi-secretaria).
 *
 * Regras de isolamento garantidas PELO BANCO (não só pelo código):
 *  - Toda tabela de negócio tem `secretaria_id`.
 *  - As chaves estrangeiras entre tabelas de negócio são compostas
 *    (secretaria_id, id), então é impossível ligar uma viagem da secretaria A
 *    a um veículo da secretaria B.
 *  - A reserva carrega `veiculo_id` e é ligada a (viagem, veículo) e
 *    (veículo, assento): o assento reservado precisa ser do veículo da viagem.
 *  - Índices únicos parciais impedem assento duplicado e paciente duplicado
 *    na mesma viagem (reservas canceladas não contam).
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  date,
  time,
  timestamp,
  jsonb,
  bigserial,
  char,
  unique,
  uniqueIndex,
  index,
  check,
  foreignKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Enums ─────────────────────────
export const papelEnum = pgEnum("papel", ["admin", "gestor", "paciente"]);
export const tipoVeiculoEnum = pgEnum("tipo_veiculo", ["carro", "van", "micro_onibus", "onibus", "ambulancia", "outro"]);
export const tipoAssentoEnum = pgEnum("tipo_assento", ["comum", "preferencial", "cadeirante", "equipe", "bloqueado"]);
export const sentidoEnum = pgEnum("sentido", ["ida", "volta"]);
export const statusViagemEnum = pgEnum("status_viagem", ["aberta", "fechada", "em_andamento", "concluida", "cancelada"]);
export const statusReservaEnum = pgEnum("status_reserva", ["solicitada", "confirmada", "cancelada"]);
export const tipoPassageiroEnum = pgEnum("tipo_passageiro", ["paciente", "acompanhante"]);
export const embarqueEnum = pgEnum("embarque", ["presente", "faltou"]);

// ───────────────────────── Secretarias (clientes) ─────────────────────────
export const secretarias = pgTable(
  "secretarias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(), // "Secretaria Municipal de Saúde de Campinas"
    municipio: text("municipio").notNull(),
    uf: char("uf", { length: 2 }).notNull(),
    slug: text("slug").notNull(), // usado no link: /campinas/entrar
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("secretarias_slug_uk").on(t.slug),
    check("secretarias_slug_formato", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("secretarias_uf_formato", sql`${t.uf} ~ '^[A-Z]{2}$'`),
  ],
);

// ───────────────────────── Usuários ─────────────────────────
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secretariaId: uuid("secretaria_id").references(() => secretarias.id, { onDelete: "restrict" }),
    papel: papelEnum("papel").notNull(),
    nome: text("nome").notNull(),
    email: text("email"), // obrigatório para admin/gestor
    cpf: char("cpf", { length: 11 }), // só dígitos; obrigatório para paciente
    cns: text("cns"), // Cartão Nacional de Saúde (opcional)
    telefone: text("telefone"),
    dataNascimento: date("data_nascimento"),
    senhaHash: text("senha_hash").notNull(),
    trocarSenha: boolean("trocar_senha").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [
    // admin é da plataforma; gestor e paciente pertencem a uma secretaria
    check(
      "usuarios_papel_secretaria",
      sql`(${t.papel} = 'admin' and ${t.secretariaId} is null) or (${t.papel} <> 'admin' and ${t.secretariaId} is not null)`,
    ),
    check("usuarios_equipe_tem_email", sql`${t.papel} = 'paciente' or ${t.email} is not null`),
    check("usuarios_paciente_tem_cpf", sql`${t.papel} <> 'paciente' or ${t.cpf} is not null`),
    check("usuarios_cpf_formato", sql`${t.cpf} is null or ${t.cpf} ~ '^[0-9]{11}$'`),
    check("usuarios_email_minusculo", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    uniqueIndex("usuarios_email_uk").on(t.email),
    // o mesmo CPF pode existir em secretarias diferentes, mas não duas vezes na mesma
    uniqueIndex("usuarios_secretaria_cpf_uk").on(t.secretariaId, t.cpf),
    unique("usuarios_secretaria_id_uk").on(t.secretariaId, t.id),
  ],
);

// ───────────────────────── Sessões de login ─────────────────────────
export const sessoes = pgTable(
  "sessoes",
  {
    id: text("id").primaryKey(), // SHA-256 do token; o token em si só fica no cookie
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("sessoes_usuario_idx").on(t.usuarioId)],
);

// ───────────────────────── Frota ─────────────────────────
export const veiculos = pgTable(
  "veiculos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secretariaId: uuid("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    tipo: tipoVeiculoEnum("tipo").notNull(),
    placa: text("placa"),
    acessivel: boolean("acessivel").notNull().default(false),
    // tamanho da grade do mapa de assentos (a célula 0,0 é sempre o motorista)
    layoutLinhas: integer("layout_linhas").notNull().default(5),
    layoutColunas: integer("layout_colunas").notNull().default(4),
    ativo: boolean("ativo").notNull().default(true), // inativar em vez de apagar (preserva histórico)
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("veiculos_secretaria_id_uk").on(t.secretariaId, t.id),
    uniqueIndex("veiculos_secretaria_placa_uk").on(t.secretariaId, t.placa),
    check("veiculos_layout_tamanho", sql`${t.layoutLinhas} between 1 and 20 and ${t.layoutColunas} between 2 and 6`),
  ],
);

export const assentos = pgTable(
  "assentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    veiculoId: uuid("veiculo_id")
      .notNull()
      .references(() => veiculos.id, { onDelete: "cascade" }),
    rotulo: text("rotulo").notNull(), // "1", "2A", "Frente"
    linha: integer("linha").notNull(), // posição no mapa (grade)
    coluna: integer("coluna").notNull(),
    tipo: tipoAssentoEnum("tipo").notNull().default("comum"),
    // assento removido do mapa, mas que tem reservas no histórico: fica guardado e oculto
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("assentos_veiculo_rotulo_uk").on(t.veiculoId, t.rotulo).where(sql`${t.ativo}`),
    uniqueIndex("assentos_veiculo_posicao_uk").on(t.veiculoId, t.linha, t.coluna).where(sql`${t.ativo}`),
    unique("assentos_veiculo_id_uk").on(t.veiculoId, t.id),
    check("assentos_posicao_valida", sql`${t.linha} >= 0 and ${t.coluna} >= 0 and not (${t.linha} = 0 and ${t.coluna} = 0)`),
  ],
);

export const motoristas = pgTable(
  "motoristas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secretariaId: uuid("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    telefone: text("telefone"),
    cnh: text("cnh"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("motoristas_secretaria_id_uk").on(t.secretariaId, t.id),
    uniqueIndex("motoristas_secretaria_cnh_uk").on(t.secretariaId, t.cnh),
  ],
);

// ───────────────────────── Viagens ─────────────────────────
export const viagens = pgTable(
  "viagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secretariaId: uuid("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "restrict" }),
    veiculoId: uuid("veiculo_id").notNull(),
    motoristaId: uuid("motorista_id"),
    data: date("data").notNull(),
    saida: time("saida").notNull(),
    sentido: sentidoEnum("sentido").notNull(),
    cidadeOrigem: text("cidade_origem").notNull(),
    cidadeDestino: text("cidade_destino").notNull(),
    viagemParId: uuid("viagem_par_id").references((): AnyPgColumn => viagens.id, { onDelete: "set null" }),
    status: statusViagemEnum("status").notNull().default("aberta"),
    reservasAte: timestamp("reservas_ate", { withTimezone: true }), // prazo para reservar
    observacoes: text("observacoes"),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("viagens_secretaria_id_uk").on(t.secretariaId, t.id),
    unique("viagens_id_veiculo_uk").on(t.id, t.veiculoId),
    foreignKey({
      name: "viagens_veiculo_mesma_secretaria_fk",
      columns: [t.secretariaId, t.veiculoId],
      foreignColumns: [veiculos.secretariaId, veiculos.id],
    }),
    foreignKey({
      name: "viagens_motorista_mesma_secretaria_fk",
      columns: [t.secretariaId, t.motoristaId],
      foreignColumns: [motoristas.secretariaId, motoristas.id],
    }),
    check("viagens_par_diferente", sql`${t.viagemParId} is null or ${t.viagemParId} <> ${t.id}`),
    index("viagens_secretaria_data_idx").on(t.secretariaId, t.data),
    index("viagens_veiculo_data_idx").on(t.veiculoId, t.data),
  ],
);

// ───────────────────────── Reservas ─────────────────────────
export const reservas = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    secretariaId: uuid("secretaria_id").notNull(),
    viagemId: uuid("viagem_id").notNull(),
    veiculoId: uuid("veiculo_id").notNull(), // cópia do veículo da viagem (garante o assento certo)
    assentoId: uuid("assento_id").notNull(),
    pacienteId: uuid("paciente_id").notNull(), // paciente responsável pela reserva
    tipoPassageiro: tipoPassageiroEnum("tipo_passageiro").notNull().default("paciente"),
    acompanhanteDe: uuid("acompanhante_de").references((): AnyPgColumn => reservas.id, { onDelete: "cascade" }),
    nomeAcompanhante: text("nome_acompanhante"),
    documentoAcompanhante: text("documento_acompanhante"),
    pontoEmbarque: text("ponto_embarque"),
    localDestino: text("local_destino"), // hospital / clínica
    horarioCompromisso: time("horario_compromisso"),
    status: statusReservaEnum("status").notNull().default("confirmada"),
    embarque: embarqueEnum("embarque"),
    embarqueMarcadoPor: uuid("embarque_marcado_por").references(() => usuarios.id),
    embarqueEm: timestamp("embarque_em", { withTimezone: true }),
    criadoPor: uuid("criado_por")
      .notNull()
      .references(() => usuarios.id),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({
      name: "reservas_viagem_mesma_secretaria_fk",
      columns: [t.secretariaId, t.viagemId],
      foreignColumns: [viagens.secretariaId, viagens.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "reservas_viagem_veiculo_fk",
      columns: [t.viagemId, t.veiculoId],
      foreignColumns: [viagens.id, viagens.veiculoId],
    }).onUpdate("cascade"),
    foreignKey({
      name: "reservas_assento_do_veiculo_fk",
      columns: [t.veiculoId, t.assentoId],
      foreignColumns: [assentos.veiculoId, assentos.id],
    }),
    foreignKey({
      name: "reservas_paciente_mesma_secretaria_fk",
      columns: [t.secretariaId, t.pacienteId],
      foreignColumns: [usuarios.secretariaId, usuarios.id],
    }),
    // um assento só pode ter uma reserva ativa por viagem
    uniqueIndex("reservas_assento_ativo_uk")
      .on(t.viagemId, t.assentoId)
      .where(sql`${t.status} <> 'cancelada'`),
    // o paciente só aparece uma vez (como paciente) em cada viagem
    uniqueIndex("reservas_paciente_ativo_uk")
      .on(t.viagemId, t.pacienteId)
      .where(sql`${t.status} <> 'cancelada' and ${t.tipoPassageiro} = 'paciente'`),
    check(
      "reservas_acompanhante_coerente",
      sql`(${t.tipoPassageiro} = 'paciente' and ${t.acompanhanteDe} is null and ${t.nomeAcompanhante} is null)
       or (${t.tipoPassageiro} = 'acompanhante' and ${t.acompanhanteDe} is not null and ${t.nomeAcompanhante} is not null)`,
    ),
    index("reservas_paciente_idx").on(t.pacienteId),
  ],
);

// ───────────────────────── Auditoria (LGPD) ─────────────────────────
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    secretariaId: uuid("secretaria_id").references(() => secretarias.id, { onDelete: "set null" }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    acao: text("acao").notNull(), // "login", "secretaria.criar", "paciente.criar"...
    entidade: text("entidade"),
    entidadeId: text("entidade_id"),
    dados: jsonb("dados"),
    ip: text("ip"),
    criadoEm: criadoEm(),
  },
  (t) => [index("auditoria_secretaria_data_idx").on(t.secretariaId, t.criadoEm)],
);

export type Papel = (typeof papelEnum.enumValues)[number];
export type Usuario = typeof usuarios.$inferSelect;
export type Secretaria = typeof secretarias.$inferSelect;
export type Veiculo = typeof veiculos.$inferSelect;
export type Assento = typeof assentos.$inferSelect;
export type TipoVeiculo = (typeof tipoVeiculoEnum.enumValues)[number];
export type TipoAssento = (typeof tipoAssentoEnum.enumValues)[number];
