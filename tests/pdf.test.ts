import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarPdfListas } from "@/lib/pdf/listaEmbarque";
import { obterVeiculo } from "@/lib/servicos/frota";
import { listaEmbarque, reservar } from "@/lib/servicos/reservas";
import { criarPaciente } from "@/lib/servicos/usuarios";
import { criarViagens } from "@/lib/servicos/viagens";
import { base, cpfAleatorio, emDias } from "./helpers";

function textoDoPdf(buf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), "pdf-"));
  const arq = join(dir, "lista.pdf");
  writeFileSync(arq, buf);
  return execFileSync("pdftotext", ["-layout", arq, "-"]).toString();
}

describe("PDF da lista de embarque", () => {
  it("gera ida + volta com passageiros, acentos, acompanhante e indicação de volta", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, {
      veiculoId: b.van.id, motoristaId: b.mot.id, data: emDias(2), saida: "05:30", cidadeOrigem: "São José", cidadeDestino: "Ribeirão Preto",
      comVolta: "on", voltaSaida: "17:00", observacoes: "Levar exames",
    });
    const assentos = (await obterVeiculo(b.gestor, b.van.id))!.assentos;
    const cpf = cpfAleatorio();
    const p2 = await criarPaciente(b.gestor, { nome: "Conceição Araújo", cpf, telefone: "(19) 99999-1234" });
    await reservar(b.paciente, {
      ida: { viagemId: r.ida, assentoId: assentos[0].id, acompanhanteAssentoId: assentos[1].id },
      volta: { viagemId: r.volta!, assentoId: assentos[0].id, acompanhanteAssentoId: assentos[1].id },
      acompanhanteNome: "José Acompanhante", localDestino: "Hospital das Clínicas", horarioCompromisso: "08:15", pontoEmbarque: "Praça da Matriz",
    });
    await reservar(b.gestor, { pacienteId: p2.paciente.id, ida: { viagemId: r.ida, assentoId: assentos[5].id } });

    const ida = (await listaEmbarque(b.gestor, r.ida))!;
    const volta = (await listaEmbarque(b.gestor, r.volta!))!;
    const buf = await gerarPdfListas([ida, volta]);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const t = textoDoPdf(buf);
    expect(t).toContain("Lista de embarque - IDA");
    expect(t).toContain("Lista de embarque - VOLTA");
    expect(t).toMatch(/São José\s+>\s+Ribeirão Preto/);
    expect(t).toMatch(/Ribeirão Preto\s+>\s+São José/);
    expect(t).toContain("Conceição Araújo");
    expect(t).toContain("José Acompanhante");
    expect(t).toMatch(/Acompanhante de Paciente/);
    expect(t).toContain("Hospital das Clínicas");
    expect(t).toContain("às 08:15");
    expect(t).toContain("Carlos Motorista");
    expect(t).toContain("Obs.: Levar exames");
    expect(t).toMatch(/Conceição Araújo.*Não/); // só tem ida
    expect(t).toContain("Página 1 de 2");
    expect(t).toContain("Página 2 de 2");
    expect(t).toContain("ASSENTO");
    expect(t).toContain("EMBARCOU");
    expect(t).toContain("pelo Rota Cuidar");
  });

  it("muitos passageiros quebram página repetindo o cabeçalho da tabela, sem páginas em branco", async () => {
    const b = await base();
    const [r] = await criarViagens(b.gestor, { veiculoId: b.van.id, data: emDias(2), saida: "06:00", cidadeOrigem: "A cidade", cidadeDestino: "B cidade" });
    const assentos = (await obterVeiculo(b.gestor, b.van.id))!.assentos;
    for (let i = 0; i < 15; i++) {
      const p = await criarPaciente(b.gestor, { nome: `Passageiro Número ${i + 1}`, cpf: cpfAleatorio() });
      await reservar(b.gestor, { pacienteId: p.paciente.id, ida: { viagemId: r.ida, assentoId: assentos[i].id }, localDestino: "Hospital Regional de Especialidades Médicas e Reabilitação" });
    }
    const t = textoDoPdf(await gerarPdfListas([(await listaEmbarque(b.gestor, r.ida))!]));
    const paginas = t.split("\f").filter((p) => p.trim());
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    expect(paginas.every((p) => p.includes("PASSAGEIRO"))).toBe(true);
    expect(t).toContain("Passageiro Número 15");
    expect(t).toContain(`Página ${paginas.length} de ${paginas.length}`);
  });
});
