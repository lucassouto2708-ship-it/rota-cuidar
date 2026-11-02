/** Dados de DEMONSTRAÇÃO para desenvolvimento. Nunca rode em produção. */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { layoutPadrao } from "../src/lib/layouts";
import { hashSenha } from "../src/lib/senha";
import type { TipoVeiculo } from "../src/db/schema";

if (process.env.NODE_ENV === "production") throw new Error("Seed não roda em produção.");
const SENHA = "demo12345";
const hash = await hashSenha(SENHA);

async function secretaria(nome: string, municipio: string, uf: string, slug: string) {
  const [ja] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.slug, slug));
  return ja ?? (await db.insert(schema.secretarias).values({ nome, municipio, uf, slug }).returning())[0];
}

await db.insert(schema.usuarios).values({ papel: "admin", nome: "Admin Demo", email: "admin@demo.com", senhaHash: hash }).onConflictDoNothing();
const a = await secretaria("Secretaria Municipal de Saúde de Vila Verde", "Vila Verde", "SP", "vila-verde");
const b = await secretaria("Secretaria Municipal de Saúde de Serra Alta", "Serra Alta", "MG", "serra-alta");
await db.insert(schema.usuarios).values([
  { papel: "gestor", secretariaId: a.id, nome: "Gestora Vila Verde", email: "gestor@vilaverde.demo", senhaHash: hash },
  { papel: "gestor", secretariaId: b.id, nome: "Gestor Serra Alta", email: "gestor@serraalta.demo", senhaHash: hash },
  { papel: "paciente", secretariaId: a.id, nome: "Maria Oliveira", cpf: "52998224725", telefone: "(19) 99999-0001", senhaHash: hash },
  { papel: "paciente", secretariaId: b.id, nome: "José Santos", cpf: "11144477735", telefone: "(31) 99999-0002", senhaHash: hash },
]).onConflictDoNothing();

async function veiculo(secretariaId: string, nome: string, tipo: TipoVeiculo, placa: string) {
  const [ja] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.placa, placa));
  if (ja) return;
  const l = layoutPadrao(tipo);
  const [v] = await db.insert(schema.veiculos).values({ secretariaId, nome, tipo, placa, layoutLinhas: l.linhas, layoutColunas: l.colunas }).returning();
  await db.insert(schema.assentos).values(l.assentos.map((a) => ({ ...a, veiculoId: v.id })));
}
await veiculo(a.id, "Van Renault Master", "van", "RTA4C82");
await veiculo(a.id, "Fiat Argo", "carro", "CUD2A19");
await veiculo(a.id, "Ambulância UTI móvel", "ambulancia", "AMB0B01");
await veiculo(b.id, "Micro-ônibus Volare", "micro_onibus", "SRA1B23");
const [temMotorista] = await db.select().from(schema.motoristas).where(eq(schema.motoristas.secretariaId, a.id)).limit(1);
if (!temMotorista)
  await db.insert(schema.motoristas).values([
    { secretariaId: a.id, nome: "Carlos Pereira", telefone: "(19) 98888-1000" },
    { secretariaId: a.id, nome: "Ana Souza", telefone: "(19) 98888-2000" },
    { secretariaId: b.id, nome: "Roberto Lima", telefone: "(31) 98888-3000" },
  ]);

// Viagens de demonstração (só se a secretaria ainda não tiver nenhuma futura)
const { criarViagens, hojeBr } = await import("../src/lib/servicos/viagens");
const { reservar } = await import("../src/lib/servicos/reservas");
const [gestorA] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, "gestor@vilaverde.demo"));
const [futura] = await db.select().from(schema.viagens).where(sql`${schema.viagens.secretariaId} = ${a.id} and ${schema.viagens.data} > ${hojeBr()}`).limit(1);
if (!futura) {
  const ator = { id: gestorA.id, papel: "gestor" as const, secretariaId: a.id };
  const [van] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.placa, "RTA4C82"));
  const [carlos] = await db.select().from(schema.motoristas).where(eq(schema.motoristas.nome, "Carlos Pereira"));
  const daqui = (n: number) => { const d = new Date(`${hojeBr()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const [v1] = await criarViagens(ator, {
    veiculoId: van.id, motoristaId: carlos.id, data: daqui(2), saida: "06:00", cidadeOrigem: "Vila Verde", cidadeDestino: "Campinas",
    comVolta: "on", voltaSaida: "16:00", repetir: "on", repetirDias: ["ter", "qui"], repetirAte: daqui(16),
  });
  const [maria] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.cpf, "52998224725"));
  const assentos = await db.select().from(schema.assentos).where(eq(schema.assentos.veiculoId, van.id)).orderBy(schema.assentos.linha, schema.assentos.coluna);
  await reservar(ator, {
    pacienteId: maria.id,
    ida: { viagemId: v1.ida, assentoId: assentos[2].id, acompanhanteAssentoId: assentos[3].id },
    volta: { viagemId: v1.volta!, assentoId: assentos[2].id, acompanhanteAssentoId: assentos[3].id },
    acompanhanteNome: "Pedro Oliveira", localDestino: "Hospital das Clínicas da Unicamp", horarioCompromisso: "09:00", pontoEmbarque: "UBS Centro",
  });
}

console.log(`Dados de demonstração prontos (senha de todos: ${SENHA}):
  Admin:            admin@demo.com           → /entrar
  Gestor Vila Verde: gestor@vilaverde.demo   → /entrar
  Gestor Serra Alta: gestor@serraalta.demo   → /entrar
  Paciente Maria:   CPF 529.982.247-25       → /vila-verde/entrar
  Paciente José:    CPF 111.444.777-35       → /serra-alta/entrar`);
await pool.end();
