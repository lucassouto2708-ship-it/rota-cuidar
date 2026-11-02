import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import {
  cancelarViagem, criarViagens, datasDaRepeticao, definirStatusViagem, editarViagem, listarViagens, obterViagem,
} from "@/lib/servicos/viagens";
import { base, emDias } from "./helpers";

const nova = (b: Awaited<ReturnType<typeof base>>, extra: Record<string, unknown> = {}) => ({
  veiculoId: b.van.id, motoristaId: b.mot.id, data: emDias(3), saida: "06:00", cidadeOrigem: "Vila Verde", cidadeDestino: "Campinas", ...extra,
});

describe("viagens", () => {
  it("cria ida e volta ligadas, com cidades invertidas na volta", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, nova(b, { comVolta: "on", voltaSaida: "16:00" }));
    const ida = (await obterViagem(b.gestor, r.ida))!;
    const volta = (await obterViagem(b.gestor, r.volta!))!;
    expect(ida.viagem.viagemParId).toBe(volta.viagem.id);
    expect(volta.viagem.viagemParId).toBe(ida.viagem.id);
    expect(volta.viagem).toMatchObject({ sentido: "volta", cidadeOrigem: "Campinas", cidadeDestino: "Vila Verde", saida: "16:00:00" });
    const lista = await listarViagens(b.gestor);
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ vagas: 15, ocupadas: 0 });
  });

  it("volta em outro dia e com outro veículo", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, nova(b, { comVolta: "on", voltaSaida: "05:00", voltaDiasDepois: "1", voltaVeiculoId: b.carro.id }));
    const volta = (await obterViagem(b.gestor, r.volta!))!;
    expect(volta.viagem.data).toBe(emDias(4));
    expect(volta.veiculo.id).toBe(b.carro.id);
  });

  it("recusa: data passada, volta antes da ida, origem = destino, prazo depois da saída, sem horário da volta", async () => {
    const b = await base();
    await expect(criarViagens(b.gestor, nova(b, { data: emDias(-1) }))).rejects.toThrow("data passada");
    await expect(criarViagens(b.gestor, nova(b, { comVolta: "on", voltaSaida: "05:00" }))).rejects.toThrow("volta precisa sair depois");
    await expect(criarViagens(b.gestor, nova(b, { cidadeDestino: "vila verde" }))).rejects.toThrow("cidades diferentes");
    await expect(criarViagens(b.gestor, nova(b, { reservasAte: `${emDias(3)}T07:00` }))).rejects.toThrow("prazo");
    await expect(criarViagens(b.gestor, nova(b, { comVolta: "on" }))).rejects.toThrow("horário de saída da volta");
  });

  it("impede o mesmo veículo ou motorista com saídas a menos de 60 min", async () => {
    const b = await base();
    await criarViagens(b.gestor, nova(b));
    await expect(criarViagens(b.gestor, nova(b, { saida: "06:30", motoristaId: "" }))).rejects.toThrow("Este veículo já tem viagem");
    await expect(criarViagens(b.gestor, nova(b, { saida: "06:45", veiculoId: b.carro.id }))).rejects.toThrow("Este motorista já tem viagem");
    await expect(criarViagens(b.gestor, nova(b, { saida: "07:00" }))).resolves.toHaveLength(1);
    // volta com o mesmo veículo menos de 60 min depois da ida
    await expect(criarViagens(b.gestor, nova(b, { data: emDias(5), comVolta: "on", voltaSaida: "06:30" }))).rejects.toThrow("pelo menos 60 minutos depois da ida");
    // com outro veículo e sem motorista em comum, a volta pode sair logo depois
    await expect(criarViagens(b.gestor, nova(b, { data: emDias(6), motoristaId: "", comVolta: "on", voltaSaida: "06:30", voltaVeiculoId: b.carro.id }))).resolves.toHaveLength(1);
    // nada foi criado na tentativa recusada (transação)
    expect((await listarViagens(b.gestor, { de: emDias(5), ate: emDias(5) }))).toHaveLength(0);
  });

  it("repete nos dias da semana até a data final, com volta em cada uma", async () => {
    const b = await base();
    const inicio = emDias(1);
    const fim = emDias(14);
    const datas = datasDaRepeticao(inicio, ["seg", "qua"], fim);
    const criadas = await criarViagens(b.gestor, nova(b, { data: inicio, comVolta: "on", voltaSaida: "15:00", repetir: "on", repetirDias: ["seg", "qua"], repetirAte: fim }));
    expect(criadas.map((c) => c.data)).toEqual(datas);
    expect(criadas.every((c) => c.volta)).toBe(true);
    for (const d of datas.slice(1)) expect([1, 3]).toContain(new Date(`${d}T12:00:00Z`).getUTCDay());
    await expect(criarViagens(b.gestor, nova(b, { repetir: "on", repetirDias: [], repetirAte: fim }))).rejects.toThrow("dias da semana");
  });

  it("aplica o prazo de reserva com a mesma antecedência nas repetições", async () => {
    const b = await base();
    const inicio = emDias(1);
    const criadas = await criarViagens(b.gestor, nova(b, {
      data: inicio, reservasAte: `${emDias(0)}T18:00`, repetir: "on", repetirDias: ["dom", "seg", "ter", "qua", "qui", "sex", "sab"], repetirAte: emDias(2),
    }));
    expect(criadas).toHaveLength(2);
    const v2 = (await obterViagem(b.gestor, criadas[1].ida))!;
    expect(v2.viagem.reservasAte!.toISOString()).toBe(new Date(`${emDias(1)}T18:00:00-03:00`).toISOString());
  });

  it("isolamento: veículo de outra secretaria, e gestor não vê viagem alheia", async () => {
    const a = await base();
    const b = await base();
    await expect(criarViagens(a.gestor, nova(a, { veiculoId: b.van.id }))).rejects.toThrow("Veículo não encontrado");
    await expect(criarViagens(a.gestor, nova(a, { motoristaId: b.mot.id }))).rejects.toThrow("Motorista não encontrado");
    const [rb] = await criarViagens(b.gestor, nova(b));
    expect(await obterViagem(a.gestor, rb.ida)).toBeNull();
    expect(await obterViagem(a.paciente, rb.ida)).toBeNull();
    await expect(cancelarViagem(a.gestor, rb.ida, "teste")).rejects.toThrow("não encontrada");
    await expect(criarViagens(a.paciente, nova(a))).rejects.toThrow("permissão");
  });

  it("veículo inativo não pode ser usado", async () => {
    const b = await base();
    await db.update(schema.veiculos).set({ ativo: false }).where(eq(schema.veiculos.id, b.van.id));
    await expect(criarViagens(b.gestor, nova(b))).rejects.toThrow("inativo");
  });

  it("edita horário/motorista respeitando conflitos e a ordem ida→volta", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, nova(b, { comVolta: "on", voltaSaida: "16:00" }));
    await expect(editarViagem(b.gestor, r.ida, { saida: "17:00" })).rejects.toThrow("volta precisa sair depois");
    await expect(editarViagem(b.gestor, r.ida, { saida: "15:30", motoristaId: b.mot.id })).rejects.toThrow("já tem viagem");
    await editarViagem(b.gestor, r.ida, { saida: "07:15", motoristaId: "" });
    const ida = (await obterViagem(b.gestor, r.ida))!;
    expect(ida.viagem.saida).toBe("07:15:00");
    expect(ida.viagem.motoristaId).toBeNull();
  });

  it("fecha/reabre, não conclui antes do dia, cancela com motivo", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, nova(b));
    await definirStatusViagem(b.gestor, r.ida, "fechada");
    expect((await obterViagem(b.gestor, r.ida))!.viagem.status).toBe("fechada");
    await definirStatusViagem(b.gestor, r.ida, "aberta");
    await expect(definirStatusViagem(b.gestor, r.ida, "concluida")).rejects.toThrow("no dia dela");
    await expect(cancelarViagem(b.gestor, r.ida, "")).rejects.toThrow("motivo");
    await cancelarViagem(b.gestor, r.ida, "Veículo quebrado");
    const v = (await obterViagem(b.gestor, r.ida))!.viagem;
    expect(v.status).toBe("cancelada");
    expect(v.observacoes).toContain("Veículo quebrado");
    await expect(cancelarViagem(b.gestor, r.ida, "de novo")).rejects.toThrow("já está cancelada");
    // viagem cancelada libera o horário do veículo
    await expect(criarViagens(b.gestor, nova(b))).resolves.toHaveLength(1);
  });
});
