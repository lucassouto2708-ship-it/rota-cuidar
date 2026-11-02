/** Garantias que o PRÓPRIO BANCO dá, mesmo se o código tiver um bug. */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { cenario, criarAdmin } from "./helpers";

/** Executa e devolve o nome da restrição do Postgres que recusou a operação (ou undefined se passou). */
async function restricao(p: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    const causa = (e as { cause?: { constraint?: string } }).cause;
    return causa?.constraint ?? `erro-sem-restricao: ${(e as Error).message}`;
  }
  return undefined;
}

async function frota(secretariaId: string) {
  const [v] = await db.insert(schema.veiculos).values({ secretariaId, nome: "Van", tipo: "van" }).returning();
  const assentos = await db
    .insert(schema.assentos)
    .values([1, 2, 3].map((n) => ({ veiculoId: v.id, rotulo: String(n), linha: 0, coluna: n })))
    .returning();
  const [viagem] = await db
    .insert(schema.viagens)
    .values({ secretariaId, veiculoId: v.id, data: "2026-12-01", saida: "06:00", sentido: "ida", cidadeOrigem: "A", cidadeDestino: "B" })
    .returning();
  return { v, assentos, viagem };
}

describe("garantias do banco", () => {
  it("impede duas reservas ativas no mesmo assento; libera após cancelar", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const f = await frota(c.sec.id);
    const base = { secretariaId: c.sec.id, viagemId: f.viagem.id, veiculoId: f.v.id, assentoId: f.assentos[0].id, pacienteId: c.paciente.id, criadoPor: c.gestor.id };
    const [r1] = await db.insert(schema.reservas).values(base).returning();

    const acompanhanteMesmoAssento = { ...base, tipoPassageiro: "acompanhante" as const, acompanhanteDe: r1.id, nomeAcompanhante: "João" };
    expect(await restricao(db.insert(schema.reservas).values(acompanhanteMesmoAssento))).toBe("reservas_assento_ativo_uk");

    await db.update(schema.reservas).set({ status: "cancelada" }).where(eq(schema.reservas.id, r1.id));
    expect(await restricao(db.insert(schema.reservas).values(base))).toBeUndefined();
  });

  it("impede o mesmo paciente duas vezes na mesma viagem, mas permite acompanhante", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const f = await frota(c.sec.id);
    const base = { secretariaId: c.sec.id, viagemId: f.viagem.id, veiculoId: f.v.id, pacienteId: c.paciente.id, criadoPor: c.gestor.id };
    const [r1] = await db.insert(schema.reservas).values({ ...base, assentoId: f.assentos[0].id }).returning();
    expect(await restricao(db.insert(schema.reservas).values({ ...base, assentoId: f.assentos[1].id }))).toBe("reservas_paciente_ativo_uk");
    const acompanhante = { ...base, assentoId: f.assentos[1].id, tipoPassageiro: "acompanhante" as const, acompanhanteDe: r1.id, nomeAcompanhante: "Maria (filha)" };
    expect(await restricao(db.insert(schema.reservas).values(acompanhante))).toBeUndefined();
  });

  it("acompanhante precisa estar ligado a um paciente e ter nome", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const f = await frota(c.sec.id);
    const semVinculo = { secretariaId: c.sec.id, viagemId: f.viagem.id, veiculoId: f.v.id, assentoId: f.assentos[0].id, pacienteId: c.paciente.id, criadoPor: c.gestor.id, tipoPassageiro: "acompanhante" as const, nomeAcompanhante: "Sem vínculo" };
    expect(await restricao(db.insert(schema.reservas).values(semVinculo))).toBe("reservas_acompanhante_coerente");
  });

  it("recusa assento que não é do veículo da viagem", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const f1 = await frota(c.sec.id);
    const f2 = await frota(c.sec.id);
    const base = { secretariaId: c.sec.id, viagemId: f1.viagem.id, pacienteId: c.paciente.id, criadoPor: c.gestor.id };
    expect(await restricao(db.insert(schema.reservas).values({ ...base, veiculoId: f1.v.id, assentoId: f2.assentos[0].id }))).toBe("reservas_assento_do_veiculo_fk");
    expect(await restricao(db.insert(schema.reservas).values({ ...base, veiculoId: f2.v.id, assentoId: f2.assentos[0].id }))).toBe("reservas_viagem_veiculo_fk");
  });

  it("recusa misturar secretarias: viagem com veículo de outra, reserva com paciente de outra", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    const fb = await frota(b.sec.id);
    const viagemCruzada = { secretariaId: a.sec.id, veiculoId: fb.v.id, data: "2026-12-01", saida: "06:00", sentido: "ida" as const, cidadeOrigem: "A", cidadeDestino: "B" };
    expect(await restricao(db.insert(schema.viagens).values(viagemCruzada))).toBe("viagens_veiculo_mesma_secretaria_fk");
    const reservaCruzada = { secretariaId: b.sec.id, viagemId: fb.viagem.id, veiculoId: fb.v.id, assentoId: fb.assentos[0].id, pacienteId: a.paciente.id, criadoPor: b.gestor.id };
    expect(await restricao(db.insert(schema.reservas).values(reservaCruzada))).toBe("reservas_paciente_mesma_secretaria_fk");
  });

  it("admin não pode ter secretaria; gestor e paciente precisam ter", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    expect(await restricao(db.insert(schema.usuarios).values({ papel: "admin", nome: "X", email: "x@x.com", secretariaId: c.sec.id, senhaHash: "x" }))).toBe("usuarios_papel_secretaria");
    expect(await restricao(db.insert(schema.usuarios).values({ papel: "paciente", nome: "X", cpf: "52998224725", senhaHash: "x" }))).toBe("usuarios_papel_secretaria");
  });
});
