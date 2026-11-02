import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { layoutPadrao, type Layout } from "@/lib/layouts";
import {
  atualizarVeiculo, criarMotorista, criarVeiculo, definirMotoristaAtivo, definirVeiculoAtivo,
  listarMotoristas, listarVeiculos, obterVeiculo, salvarLayout,
} from "@/lib/servicos/frota";
import { cenario, criarAdmin, uid } from "./helpers";

const amanha = () => new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const ontem = () => new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);

async function viagemComReserva(c: Awaited<ReturnType<typeof cenario>>, veiculoId: string, assentoId: string, data: string, motoristaId?: string) {
  const [v] = await db.insert(schema.viagens).values({
    secretariaId: c.sec.id, veiculoId, motoristaId, data, saida: "06:00", sentido: "ida", cidadeOrigem: "A", cidadeDestino: "B",
  }).returning();
  await db.insert(schema.reservas).values({
    secretariaId: c.sec.id, viagemId: v.id, veiculoId, assentoId, pacienteId: c.paciente.id, criadoPor: c.gestor.id,
  });
  return v;
}

const layoutDe = (v: NonNullable<Awaited<ReturnType<typeof obterVeiculo>>>): Layout => ({
  linhas: v.layoutLinhas, colunas: v.layoutColunas,
  assentos: v.assentos.map(({ linha, coluna, rotulo, tipo }) => ({ linha, coluna, rotulo, tipo })),
});

describe("frota: veículos", () => {
  it("gestor cria veículo já com o mapa do modelo e a placa normalizada", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Van Master", tipo: "van", placa: "rta-4c82", acessivel: "on" });
    expect(v.placa).toBe("RTA4C82");
    expect(v.acessivel).toBe(true);
    const lista = await listarVeiculos(c.gestor);
    expect(lista).toHaveLength(1);
    expect(lista[0].vagas).toBe(15);
    const completo = await obterVeiculo(c.gestor, v.id);
    expect(completo?.assentos).toHaveLength(15);
  });

  it("valida placa, impede placa duplicada e permite a mesma placa em outra secretaria", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    await expect(criarVeiculo(a.gestor, { nome: "Carro", tipo: "carro", placa: "12345" })).rejects.toThrow("Placa inválida");
    await criarVeiculo(a.gestor, { nome: "Carro 1", tipo: "carro", placa: "ABC-1234" });
    await expect(criarVeiculo(a.gestor, { nome: "Carro 2", tipo: "carro", placa: "abc1234" })).rejects.toThrow("Já existe um veículo com esta placa");
    await expect(criarVeiculo(b.gestor, { nome: "Carro B", tipo: "carro", placa: "ABC1234" })).resolves.toBeTruthy();
    await expect(criarVeiculo(a.gestor, { nome: "Sem placa 1", tipo: "carro" })).resolves.toBeTruthy();
    await expect(criarVeiculo(a.gestor, { nome: "Sem placa 2", tipo: "carro", placa: "" })).resolves.toBeTruthy();
  });

  it("isolamento: gestor não vê, não edita e não altera o mapa de veículo de outra secretaria", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    const vb = await criarVeiculo(b.gestor, { nome: "Van B", tipo: "van" });
    expect(await obterVeiculo(a.gestor, vb.id)).toBeNull();
    expect(await listarVeiculos(a.gestor)).toHaveLength(0);
    await expect(atualizarVeiculo(a.gestor, vb.id, { nome: "Roubada", tipo: "van" })).rejects.toThrow("não encontrado");
    await expect(salvarLayout(a.gestor, vb.id, layoutPadrao("carro"))).rejects.toThrow("não encontrado");
    await expect(definirVeiculoAtivo(a.gestor, vb.id, false)).rejects.toThrow("não encontrado");
    await expect(criarVeiculo(a.paciente, { nome: "X", tipo: "van" })).rejects.toThrow("permissão");
    await expect(listarVeiculos(admin)).rejects.toThrow("permissão");
  });

  it("não inativa veículo com viagem futura; inativa se só tiver viagem passada", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Van", tipo: "van" });
    const comp = (await obterVeiculo(c.gestor, v.id))!;
    const viagem = await viagemComReserva(c, v.id, comp.assentos[0].id, amanha());
    await expect(definirVeiculoAtivo(c.gestor, v.id, false)).rejects.toThrow("tem viagem marcada");
    await db.update(schema.viagens).set({ data: ontem() }).where(eq(schema.viagens.id, viagem.id));
    await expect(definirVeiculoAtivo(c.gestor, v.id, false)).resolves.toBeUndefined();
    expect(await listarVeiculos(c.gestor, { somenteAtivos: true })).toHaveLength(0);
  });
});

describe("frota: salvar mapa de assentos", () => {
  it("adiciona, muda tipo e remove assentos", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
    const l = layoutDe((await obterVeiculo(c.gestor, v.id))!);
    l.linhas = 3;
    l.assentos.push({ linha: 2, coluna: 1, rotulo: "5", tipo: "cadeirante" });
    l.assentos[0].tipo = "preferencial";
    l.assentos = l.assentos.filter((a) => !(a.linha === 1 && a.coluna === 2));
    const r = await salvarLayout(c.gestor, v.id, l);
    expect(r).toEqual({ vagas: 4, equipe: 0 });
    const depois = (await obterVeiculo(c.gestor, v.id))!;
    expect(depois.layoutLinhas).toBe(3);
    expect(depois.assentos.map((a) => `${a.linha},${a.coluna}:${a.tipo}`)).toEqual(["0,2:preferencial", "1,0:comum", "1,1:comum", "2,1:cadeirante"]);
  });

  it("mantém o mesmo assento (mesmo id) na mesma posição, mesmo trocando os nomes entre si", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
    const antes = (await obterVeiculo(c.gestor, v.id))!;
    const l = layoutDe(antes);
    // inverte a numeração: o "1" vira "4" e vice-versa (exige a troca em duas etapas)
    l.assentos = l.assentos.map((a) => ({ ...a, rotulo: String(5 - Number(a.rotulo)) }));
    await salvarLayout(c.gestor, v.id, l);
    const depois = (await obterVeiculo(c.gestor, v.id))!;
    for (const a of antes.assentos) {
      const d = depois.assentos.find((x) => x.linha === a.linha && x.coluna === a.coluna)!;
      expect(d.id).toBe(a.id);
      expect(d.rotulo).toBe(String(5 - Number(a.rotulo)));
    }
  });

  it("não deixa remover nem bloquear assento com reserva em viagem futura", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
    const comp = (await obterVeiculo(c.gestor, v.id))!;
    const alvo = comp.assentos[1];
    await viagemComReserva(c, v.id, alvo.id, amanha());
    const semAlvo = layoutDe(comp);
    semAlvo.assentos = semAlvo.assentos.filter((a) => a.rotulo !== alvo.rotulo);
    await expect(salvarLayout(c.gestor, v.id, semAlvo)).rejects.toThrow(`O assento ${alvo.rotulo} tem passageiro reservado`);
    const bloqueado = layoutDe(comp);
    bloqueado.assentos.find((a) => a.rotulo === alvo.rotulo)!.tipo = "bloqueado";
    await expect(salvarLayout(c.gestor, v.id, bloqueado)).rejects.toThrow("tem passageiro reservado");
    // nada mudou
    expect((await obterVeiculo(c.gestor, v.id))!.assentos).toHaveLength(4);
    // mas pode virar preferencial (continua aceitando passageiro)
    const pref = layoutDe(comp);
    pref.assentos.find((a) => a.rotulo === alvo.rotulo)!.tipo = "preferencial";
    await expect(salvarLayout(c.gestor, v.id, pref)).resolves.toBeTruthy();
  });

  it("assento com reserva só no histórico é ocultado (não apagado) e a posição pode ser reutilizada", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
    const comp = (await obterVeiculo(c.gestor, v.id))!;
    const alvo = comp.assentos[1];
    await viagemComReserva(c, v.id, alvo.id, ontem());
    const l = layoutDe(comp);
    l.assentos = l.assentos.filter((a) => a.rotulo !== alvo.rotulo);
    await salvarLayout(c.gestor, v.id, l);
    const [oculto] = await db.select().from(schema.assentos).where(eq(schema.assentos.id, alvo.id));
    expect(oculto.ativo).toBe(false); // histórico preservado
    expect((await obterVeiculo(c.gestor, v.id))!.assentos).toHaveLength(3);
    // recoloca um assento na mesma posição e com o mesmo nome
    l.assentos.push({ linha: alvo.linha, coluna: alvo.coluna, rotulo: alvo.rotulo, tipo: "comum" });
    await salvarLayout(c.gestor, v.id, l);
    const depois = (await obterVeiculo(c.gestor, v.id))!;
    expect(depois.assentos).toHaveLength(4);
    expect(depois.assentos.find((a) => a.rotulo === alvo.rotulo)!.id).not.toBe(alvo.id);
  });

  it("recusa mapa inválido sem alterar nada", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Van", tipo: "van" });
    const invalido = layoutPadrao("van");
    invalido.assentos[1].rotulo = invalido.assentos[0].rotulo;
    await expect(salvarLayout(c.gestor, v.id, invalido)).rejects.toThrow("repetido");
    expect((await obterVeiculo(c.gestor, v.id))!.assentos).toHaveLength(15);
  });

  it("dois gestores salvando ao mesmo tempo não corrompem o mapa", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Van", tipo: "van" });
    const l1 = layoutPadrao("van");
    const l2 = { ...layoutPadrao("carro"), linhas: 6, colunas: 4 };
    await Promise.all([salvarLayout(c.gestor, v.id, l1), salvarLayout(c.gestor, v.id, l2)]);
    const final = (await obterVeiculo(c.gestor, v.id))!;
    expect([15, 4]).toContain(final.assentos.length);
  });
});

describe("frota: motoristas", () => {
  it("cria, lista, valida CNH e impede CNH duplicada", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    const cnh = String(Date.now()).slice(-11).padStart(11, "1");
    const m = await criarMotorista(a.gestor, { nome: "João Motorista", telefone: "(19) 9999-0000", cnh });
    expect((await listarMotoristas(a.gestor)).map((x) => x.id)).toEqual([m.id]);
    expect(await listarMotoristas(b.gestor)).toHaveLength(0);
    await expect(criarMotorista(a.gestor, { nome: "Outro", cnh })).rejects.toThrow("Já existe um motorista com esta CNH");
    await expect(criarMotorista(a.gestor, { nome: "Outro", cnh: "123" })).rejects.toThrow("11 dígitos");
    await expect(criarMotorista(b.gestor, { nome: "Mesmo CNH outra cidade", cnh })).resolves.toBeTruthy();
    await expect(definirMotoristaAtivo(b.gestor, m.id, false)).rejects.toThrow("não encontrado");
  });

  it("não inativa motorista escalado em viagem futura", async () => {
    const c = await cenario(await criarAdmin());
    const m = await criarMotorista(c.gestor, { nome: "Motorista " + uid() });
    const v = await criarVeiculo(c.gestor, { nome: "Van", tipo: "van" });
    const comp = (await obterVeiculo(c.gestor, v.id))!;
    await viagemComReserva(c, v.id, comp.assentos[0].id, amanha(), m.id);
    await expect(definirMotoristaAtivo(c.gestor, m.id, false)).rejects.toThrow("escalado");
    const [mm] = await db.select().from(schema.motoristas).where(and(eq(schema.motoristas.id, m.id)));
    expect(mm.ativo).toBe(true);
  });
});

describe("frota: entrada malformada", () => {
  it("recusa mapa com formato inválido vindo do navegador", async () => {
    const c = await cenario(await criarAdmin());
    const v = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
    for (const lixo of [null, "x", { linhas: 2 }, { linhas: 2, colunas: 3, assentos: [{ linha: 0, coluna: 1, rotulo: 5, tipo: "comum" }] }])
      await expect(salvarLayout(c.gestor, v.id, lixo)).rejects.toThrow("formato inválido");
  });
});
