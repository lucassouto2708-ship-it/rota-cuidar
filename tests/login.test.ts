import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { entrarEquipe, entrarPaciente, MAX_FALHAS } from "@/lib/login";
import { validarSessao } from "@/lib/sessao";
import { definirSecretariaAtiva } from "@/lib/servicos/secretarias";
import { definirPacienteAtivo, trocarPropriaSenha } from "@/lib/servicos/usuarios";
import { cenario, criarAdmin } from "./helpers";

describe("login", () => {
  it("admin e gestor entram por e-mail; e-mail não diferencia maiúsculas", async () => {
    const admin = await criarAdmin();
    const r = await entrarEquipe(admin.email.toUpperCase(), admin.senha);
    expect(r.papel).toBe("admin");
    const c = await cenario(admin);
    const g = await entrarEquipe(c.gestorEmail, c.gestorSenha);
    expect(g.papel).toBe("gestor");
    expect(g.trocarSenha).toBe(true);
    const sessao = await validarSessao(g.token);
    expect(sessao?.usuario.secretaria?.id).toBe(c.sec.id);
    expect(sessao?.usuario).not.toHaveProperty("senhaHash");
  });

  it("paciente entra com CPF (com máscara) só no link da própria secretaria", async () => {
    const admin = await criarAdmin();
    const a = await cenario(admin);
    const b = await cenario(admin);
    const mascarado = a.pacienteCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    const r = await entrarPaciente(a.sec.slug, mascarado, a.pacienteSenha);
    expect(r.papel).toBe("paciente");
    await expect(entrarPaciente(b.sec.slug, a.pacienteCpf, a.pacienteSenha)).rejects.toThrow("Dados de acesso incorretos.");
  });

  it("paciente não entra pela tela da equipe", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    await expect(entrarEquipe(c.pacienteCpf, c.pacienteSenha)).rejects.toThrow("Dados de acesso incorretos.");
  });

  it(`bloqueia após ${MAX_FALHAS} senhas erradas, mesmo com a senha certa depois`, async () => {
    const admin = await criarAdmin();
    for (let i = 0; i < MAX_FALHAS; i++) await expect(entrarEquipe(admin.email, "errada")).rejects.toThrow("incorretos");
    await expect(entrarEquipe(admin.email, admin.senha)).rejects.toThrow("Muitas tentativas");
  });

  it("suspender a secretaria derruba sessões de gestor e paciente, mas não do admin", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const sAdmin = await entrarEquipe(admin.email, admin.senha);
    const sGestor = await entrarEquipe(c.gestorEmail, c.gestorSenha);
    const sPac = await entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha);
    await definirSecretariaAtiva(admin, c.sec.id, false);
    expect(await validarSessao(sGestor.token)).toBeNull();
    expect(await validarSessao(sPac.token)).toBeNull();
    expect(await validarSessao(sAdmin.token)).not.toBeNull();
    await expect(entrarEquipe(c.gestorEmail, c.gestorSenha)).rejects.toThrow("suspenso");
    await expect(entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha)).rejects.toThrow("suspenso");
  });

  it("paciente desativado perde a sessão e não entra", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const s = await entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha);
    await definirPacienteAtivo(c.gestor, c.paciente.id, false);
    expect(await validarSessao(s.token)).toBeNull();
    await expect(entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha)).rejects.toThrow("desativado");
  });

  it("trocar senha mantém a sessão atual e derruba as outras", async () => {
    const admin = await criarAdmin();
    const c = await cenario(admin);
    const s1 = await entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha);
    const s2 = await entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha);
    await trocarPropriaSenha(c.paciente, c.pacienteSenha, "nova-senha-forte", s1.token);
    expect(await validarSessao(s1.token)).not.toBeNull();
    expect(await validarSessao(s2.token)).toBeNull();
    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, c.paciente.id));
    expect(u.trocarSenha).toBe(false);
    await expect(entrarPaciente(c.sec.slug, c.pacienteCpf, c.pacienteSenha)).rejects.toThrow();
    await expect(entrarPaciente(c.sec.slug, c.pacienteCpf, "nova-senha-forte")).resolves.toBeTruthy();
  });

  it("token inválido ou ausente não autentica", async () => {
    expect(await validarSessao(undefined)).toBeNull();
    expect(await validarSessao("token-falso")).toBeNull();
  });
});
