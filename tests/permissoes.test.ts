import { describe, expect, it } from "vitest";
import { criarGestor, criarSecretaria, listarSecretarias } from "@/lib/servicos/secretarias";
import { criarPaciente, definirPacienteAtivo, listarPacientes, redefinirSenhaPaciente } from "@/lib/servicos/usuarios";
import { cenario, cpfAleatorio, criarAdmin, uid } from "./helpers";

describe("3 níveis de acesso e isolamento entre secretarias", () => {
  it("só o admin cria e lista secretarias e gestores", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const dados = { nome: "Outra", municipio: "Xis", uf: "MG", slug: `x-${uid()}` };
    await expect(criarSecretaria(c.gestor, dados)).rejects.toThrow("permissão");
    await expect(criarSecretaria(c.paciente, dados)).rejects.toThrow("permissão");
    await expect(listarSecretarias(c.gestor)).rejects.toThrow("permissão");
    await expect(criarGestor(c.gestor, c.sec.id, { nome: "Intruso", email: `i-${uid()}@t.com` })).rejects.toThrow("permissão");
  });

  it("só o gestor cria pacientes, e sempre na secretaria dele", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    await expect(criarPaciente(admin, { nome: "Fulano", cpf: cpfAleatorio() })).rejects.toThrow("permissão");
    await expect(criarPaciente(a.paciente, { nome: "Fulano", cpf: cpfAleatorio() })).rejects.toThrow("permissão");
    // tentar "injetar" outra secretaria no formulário é ignorado
    const r = await criarPaciente(a.gestor, { nome: "Fulano de Tal", cpf: cpfAleatorio(), secretariaId: b.sec.id });
    const listaA = await listarPacientes(a.gestor);
    const listaB = await listarPacientes(b.gestor);
    expect(listaA.map((p) => p.id)).toContain(r.paciente.id);
    expect(listaB.map((p) => p.id)).not.toContain(r.paciente.id);
  });

  it("gestor não vê nem altera paciente de outra secretaria", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    expect((await listarPacientes(a.gestor)).map((p) => p.id)).not.toContain(b.paciente.id);
    await expect(redefinirSenhaPaciente(a.gestor, b.paciente.id)).rejects.toThrow("não encontrado");
    await expect(definirPacienteAtivo(a.gestor, b.paciente.id, false)).rejects.toThrow("não encontrado");
  });

  it("mesmo CPF pode existir em duas secretarias, mas não duas vezes na mesma", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    await expect(criarPaciente(b.gestor, { nome: "Mesma Pessoa", cpf: a.pacienteCpf })).resolves.toBeTruthy();
    await expect(criarPaciente(a.gestor, { nome: "Duplicado", cpf: a.pacienteCpf })).rejects.toThrow("Já existe um paciente com este CPF");
  });

  it("valida dados: CPF inválido, link reservado, link duplicado, e-mail duplicado", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    await expect(criarPaciente(c.gestor, { nome: "Fulano", cpf: "123.456.789-00" })).rejects.toThrow("CPF inválido");
    await expect(criarSecretaria(admin, { nome: "Sec Admin", municipio: "Xis", uf: "SP", slug: "admin" })).rejects.toThrow("reservado");
    await expect(criarSecretaria(admin, { nome: "Sec Dup", municipio: "Xis", uf: "SP", slug: c.sec.slug })).rejects.toThrow("Já existe");
    await expect(criarGestor(admin, c.sec.id, { nome: "Dup Gestor", email: c.gestorEmail })).rejects.toThrow("já está em uso");
  });
});
