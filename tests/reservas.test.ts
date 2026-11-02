import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { obterVeiculo } from "@/lib/servicos/frota";
import {
  cancelarReserva, listaEmbarque, mapaDaViagem, marcarEmbarque, minhasReservas, moverReserva, reservar, viagensDisponiveis,
} from "@/lib/servicos/reservas";
import { criarPaciente } from "@/lib/servicos/usuarios";
import { cancelarViagem, criarViagens, definirStatusViagem, hojeBr } from "@/lib/servicos/viagens";
import { cpfAleatorio } from "./helpers";
import { base, emDias } from "./helpers";

async function cenarioViagem(opts: { carro?: boolean; data?: string } = {}) {
  const b = await base();
  const veiculo = opts.carro ? b.carro : b.van;
  const [r] = await criarViagens(b.gestor, {
    veiculoId: veiculo.id, data: opts.data ?? emDias(3), saida: "06:00", cidadeOrigem: "Vila Verde", cidadeDestino: "Campinas", comVolta: "on", voltaSaida: "16:00",
  });
  const assentos = (await obterVeiculo(b.gestor, veiculo.id))!.assentos;
  return { ...b, ida: r.ida, volta: r.volta!, assentos };
}

async function maisPacientes(gestor: Awaited<ReturnType<typeof base>>["gestor"], n: number) {
  const lista = [];
  for (let i = 0; i < n; i++) {
    const p = await criarPaciente(gestor, { nome: `Paciente Extra ${i}`, cpf: cpfAleatorio() });
    lista.push({ id: p.paciente.id, papel: "paciente" as const, secretariaId: gestor.secretariaId });
  }
  return lista;
}

describe("reservas", () => {
  it("paciente reserva ida + volta com acompanhante numa operação só", async () => {
    const c = await cenarioViagem();
    const [a1, a2, a3, a4] = c.assentos;
    const r = await reservar(c.paciente, {
      ida: { viagemId: c.ida, assentoId: a1.id, acompanhanteAssentoId: a2.id },
      volta: { viagemId: c.volta, assentoId: a3.id, acompanhanteAssentoId: a4.id },
      acompanhanteNome: "Maria Filha", acompanhanteDocumento: "12.345.678-9", pontoEmbarque: "Posto central", localDestino: "Hospital das Clínicas", horarioCompromisso: "09:30",
    });
    expect(r.reservas).toHaveLength(4);
    const mapa = (await mapaDaViagem(c.paciente, c.ida))!;
    expect(mapa.assentos.filter((a) => a.estado === "meu")).toHaveLength(2);
    expect(mapa.livres).toBe(13);
    expect(mapa.assentos.some((a) => "passageiro" in a)).toBe(false); // paciente não vê nomes
    const minhas = await minhasReservas(c.paciente);
    expect(minhas.proximas).toHaveLength(2);
    expect(minhas.proximas[0]).toMatchObject({ acompanhante: "Maria Filha", assento: a1.rotulo, acompanhanteAssento: a2.rotulo });
  });

  it("tudo ou nada: se a volta falhar, a ida também não é reservada", async () => {
    const c = await cenarioViagem();
    const [outro] = await maisPacientes(c.gestor, 1);
    await reservar(c.gestor, { pacienteId: outro.id, ida: { viagemId: c.ida, assentoId: c.assentos[9].id }, volta: { viagemId: c.volta, assentoId: c.assentos[5].id } });
    await expect(
      reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id }, volta: { viagemId: c.volta, assentoId: c.assentos[5].id } }),
    ).rejects.toThrow("acabou de ser reservado");
    const mapa = (await mapaDaViagem(c.paciente, c.ida))!;
    expect(mapa.assentos.find((a) => a.id === c.assentos[0].id)!.estado).toBe("livre");
  });

  it("20 pacientes disputando 4 assentos ao mesmo tempo: só 4 conseguem, sem duplicar", async () => {
    const c = await cenarioViagem({ carro: true });
    const pacs = await maisPacientes(c.gestor, 20);
    const resultados = await Promise.allSettled(
      pacs.map((p, i) => reservar(p, { ida: { viagemId: c.ida, assentoId: c.assentos[i % 4].id } })),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(falhas.every((f) => /acabou de ser reservado/.test(f.reason.message))).toBe(true);
    const ativas = await db.select().from(schema.reservas).where(eq(schema.reservas.viagemId, c.ida));
    expect(new Set(ativas.map((r) => r.assentoId)).size).toBe(4);
  });

  it("recusa: assento da equipe/bloqueado, assento de outro veículo, mesmo assento para paciente e acompanhante", async () => {
    const c = await cenarioViagem();
    const [equipe] = await db.update(schema.assentos).set({ tipo: "equipe" }).where(eq(schema.assentos.id, c.assentos[14].id)).returning();
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: equipe.id } })).rejects.toThrow("Assento indisponível");
    const doCarro = (await obterVeiculo(c.gestor, c.carro.id))!.assentos[0];
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: doCarro.id } })).rejects.toThrow("Assento indisponível");
    await expect(
      reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id, acompanhanteAssentoId: c.assentos[0].id }, acompanhanteNome: "Fulano" }),
    ).rejects.toThrow("assentos diferentes");
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id, acompanhanteAssentoId: c.assentos[1].id } })).rejects.toThrow(
      "nome do acompanhante",
    );
  });

  it("paciente não reserva duas vezes a mesma viagem, nem duas idas no mesmo dia", async () => {
    const c = await cenarioViagem();
    await reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } });
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[1].id } })).rejects.toThrow("já tem reserva nesta viagem");
    const [outra] = await criarViagens(c.gestor, { veiculoId: c.carro.id, data: emDias(3), saida: "09:00", cidadeOrigem: "Vila Verde", cidadeDestino: "Sorocaba" });
    const assentoCarro = (await obterVeiculo(c.gestor, c.carro.id))!.assentos[0];
    await expect(reservar(c.paciente, { ida: { viagemId: outra.ida, assentoId: assentoCarro.id } })).rejects.toThrow("Você já tem reserva de ida");
  });

  it("prazo e status: paciente bloqueado após o prazo/fechada; gestor ainda reserva", async () => {
    const c = await cenarioViagem();
    await db.update(schema.viagens).set({ reservasAte: new Date(Date.now() - 60_000) }).where(eq(schema.viagens.id, c.ida));
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } })).rejects.toThrow("prazo para reservar");
    expect((await viagensDisponiveis(c.paciente)).map((v) => v.viagem.id)).not.toContain(c.ida);
    await reservar(c.gestor, { pacienteId: c.paciente.id, ida: { viagemId: c.ida, assentoId: c.assentos[0].id } });
    await definirStatusViagem(c.gestor, c.volta, "fechada");
    await expect(reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[1].id } })).rejects.toThrow();
  });

  it("viagem que já saiu ou cancelada não aceita reserva de ninguém", async () => {
    const c = await cenarioViagem();
    await db.update(schema.viagens).set({ data: emDias(-1) }).where(eq(schema.viagens.id, c.ida));
    await expect(reservar(c.gestor, { pacienteId: c.paciente.id, ida: { viagemId: c.ida, assentoId: c.assentos[0].id } })).rejects.toThrow("já saiu");
    await cancelarViagem(c.gestor, c.volta, "Chuva forte");
    await expect(reservar(c.gestor, { pacienteId: c.paciente.id, ida: { viagemId: c.volta, assentoId: c.assentos[0].id } })).rejects.toThrow("cancelada");
  });

  it("paciente pode reservar só a volta", async () => {
    const c = await cenarioViagem();
    await expect(reservar(c.paciente, { ida: { viagemId: c.volta, assentoId: c.assentos[0].id } })).resolves.toBeTruthy();
  });

  it("isolamento: paciente não reserva/vê viagem de outra secretaria; gestor não reserva paciente de outra", async () => {
    const a = await cenarioViagem();
    const b = await cenarioViagem();
    await expect(reservar(a.paciente, { ida: { viagemId: b.ida, assentoId: b.assentos[0].id } })).rejects.toThrow("Viagem não encontrada");
    expect(await mapaDaViagem(a.paciente, b.ida)).toBeNull();
    await expect(reservar(a.gestor, { pacienteId: b.paciente.id, ida: { viagemId: a.ida, assentoId: a.assentos[0].id } })).rejects.toThrow("Paciente não encontrado");
    await expect(reservar(a.paciente, { pacienteId: b.paciente.id, ida: { viagemId: a.ida, assentoId: a.assentos[0].id } })).rejects.toThrow("permissão");
    expect((await viagensDisponiveis(a.paciente)).map((v) => v.viagem.id)).not.toContain(b.ida);
  });

  it("cancelamento: paciente cancela a própria (com o acompanhante); não cancela a de outro", async () => {
    const c = await cenarioViagem();
    const [outro] = await maisPacientes(c.gestor, 1);
    const r = await reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id, acompanhanteAssentoId: c.assentos[1].id }, acompanhanteNome: "João Acomp" });
    await expect(cancelarReserva(outro, r.reservas[0])).rejects.toThrow("não encontrada");
    expect(await cancelarReserva(c.paciente, r.reservas[0])).toEqual({ canceladas: 2 });
    expect((await mapaDaViagem(c.paciente, c.ida))!.livres).toBe(15);
    await expect(cancelarReserva(c.paciente, r.reservas[0])).rejects.toThrow("já está cancelada");
    // assento liberado pode ser reservado de novo
    await expect(reservar(outro, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } })).resolves.toBeTruthy();
  });

  it("gestor move passageiro de assento e não deixa ir para assento ocupado", async () => {
    const c = await cenarioViagem();
    const [outro] = await maisPacientes(c.gestor, 1);
    const r1 = await reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } });
    await reservar(outro, { ida: { viagemId: c.ida, assentoId: c.assentos[1].id } });
    await expect(moverReserva(c.gestor, r1.reservas[0], c.assentos[1].id)).rejects.toThrow("acabou de ser reservado");
    await moverReserva(c.gestor, r1.reservas[0], c.assentos[2].id);
    const mapa = (await mapaDaViagem(c.gestor, c.ida))!;
    expect(mapa.assentos.find((a) => a.id === c.assentos[2].id)!.passageiro?.reservaId).toBe(r1.reservas[0]);
    await expect(moverReserva(c.paciente, r1.reservas[0], c.assentos[3].id)).rejects.toThrow("permissão");
  });

  it("cancelar a viagem cancela todas as reservas", async () => {
    const c = await cenarioViagem();
    await reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } });
    expect(await cancelarViagem(c.gestor, c.ida, "Feriado")).toEqual({ reservasCanceladas: 1 });
    expect((await minhasReservas(c.paciente)).proximas[0].reserva.status).toBe("cancelada");
  });
});

describe("lista de embarque e presença", () => {
  it("lista em ordem de assento, com acompanhante e indicação de quem tem volta", async () => {
    const c = await cenarioViagem({ data: emDias(1) });
    const [outro] = await maisPacientes(c.gestor, 1);
    await reservar(c.paciente, {
      ida: { viagemId: c.ida, assentoId: c.assentos[3].id, acompanhanteAssentoId: c.assentos[4].id },
      volta: { viagemId: c.volta, assentoId: c.assentos[3].id, acompanhanteAssentoId: c.assentos[4].id },
      acompanhanteNome: "Ana Acompanhante", pontoEmbarque: "Praça Matriz", localDestino: "Hospital X", horarioCompromisso: "10:00",
    });
    await reservar(outro, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } }); // só ida
    const lista = (await listaEmbarque(c.gestor, c.ida))!;
    expect(lista.passageiros.map((p) => p.assento)).toEqual([c.assentos[0].rotulo, c.assentos[3].rotulo, c.assentos[4].rotulo]);
    expect(lista.passageiros[0]).toMatchObject({ nome: "Paciente Extra 0", temOutroTrecho: false });
    expect(lista.passageiros[1]).toMatchObject({ tipo: "paciente", temOutroTrecho: true, localDestino: "Hospital X", horarioCompromisso: "10:00:00" });
    expect(lista.passageiros[2]).toMatchObject({ nome: "Ana Acompanhante", tipo: "acompanhante", temOutroTrecho: true });
    expect(lista.resumo).toEqual({ total: 3, presentes: 0, faltas: 0, pendentes: 3 });
    expect(await listaEmbarque(c.paciente as never, c.ida).catch((e) => e.message)).toMatch(/permissão/);
  });

  it("presença só no dia da viagem; marca presente/faltou e desfaz", async () => {
    const c = await cenarioViagem();
    const r = await reservar(c.paciente, { ida: { viagemId: c.ida, assentoId: c.assentos[0].id } });
    await expect(marcarEmbarque(c.gestor, r.reservas[0], "presente")).rejects.toThrow("no dia da viagem");
    await db.update(schema.viagens).set({ data: hojeBr() }).where(eq(schema.viagens.id, c.ida));
    await marcarEmbarque(c.gestor, r.reservas[0], "faltou");
    expect((await listaEmbarque(c.gestor, c.ida))!.resumo).toMatchObject({ faltas: 1, pendentes: 0 });
    await marcarEmbarque(c.gestor, r.reservas[0], null);
    expect((await listaEmbarque(c.gestor, c.ida))!.resumo).toMatchObject({ faltas: 0, pendentes: 1 });
    await expect(marcarEmbarque(c.gestor, r.reservas[0], "talvez" as never)).rejects.toThrow("inválida");
  });
});
