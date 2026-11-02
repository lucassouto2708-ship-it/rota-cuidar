import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { Ator } from "@/lib/permissoes";
import { hashSenha } from "@/lib/senha";
import { criarGestor, criarSecretaria } from "@/lib/servicos/secretarias";
import { criarMotorista, criarVeiculo } from "@/lib/servicos/frota";
import { criarPaciente } from "@/lib/servicos/usuarios";
import { hojeBr } from "@/lib/servicos/viagens";

export const uid = () => randomUUID().slice(0, 8);

/** Gera um CPF válido aleatório. */
export function cpfAleatorio(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base: number[]) => {
    const s = base.reduce((a, d, i) => a + d * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join("");
}

export async function criarAdmin(senha = "senha-admin-123"): Promise<Ator & { email: string; senha: string }> {
  const email = `admin-${uid()}@teste.com`;
  const [u] = await db
    .insert(schema.usuarios)
    .values({ papel: "admin", nome: "Admin", email, senhaHash: await hashSenha(senha) })
    .returning();
  return { id: u.id, papel: "admin", secretariaId: null, email, senha };
}

/** Cria uma secretaria completa: gestor (como Ator) e um paciente. */
export async function cenario(admin: Ator) {
  const s = uid();
  const sec = await criarSecretaria(admin, { nome: `Secretaria ${s}`, municipio: `Cidade ${s}`, uf: "sp", slug: `cidade-${s}` });
  const g = await criarGestor(admin, sec.id, { nome: `Gestor ${s}`, email: `gestor-${s}@teste.com` });
  const gestor: Ator = { id: g.gestor.id, papel: "gestor", secretariaId: sec.id };
  const cpf = cpfAleatorio();
  const p = await criarPaciente(gestor, { nome: `Paciente ${s}`, cpf });
  const paciente: Ator = { id: p.paciente.id, papel: "paciente", secretariaId: sec.id };
  return { sec, gestor, gestorEmail: g.gestor.email!, gestorSenha: g.senhaProvisoria, paciente, pacienteCpf: cpf, pacienteSenha: p.senhaProvisoria };
}

/** Data (AAAA-MM-DD) daqui a n dias, no fuso de Brasília. */
export const emDias = (n: number) => {
  const d = new Date(`${hojeBr()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Secretaria com uma van (15), um carro (4) e um motorista. */
export async function base() {
  const c = await cenario(await criarAdmin());
  const van = await criarVeiculo(c.gestor, { nome: "Van", tipo: "van" });
  const carro = await criarVeiculo(c.gestor, { nome: "Carro", tipo: "carro" });
  const mot = await criarMotorista(c.gestor, { nome: "Carlos Motorista" });
  return { ...c, van, carro, mot };
}
