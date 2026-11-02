/** Pacientes (gerenciados pelo GESTOR da própria secretaria) e troca de senha. */
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { registrar } from "../auditoria";
import { cpfValido, soDigitos } from "../cpf";
import { ErroNegocio, traduzirErroBanco } from "../erros";
import { type Ator, exigirPapel, secretariaDoAtor } from "../permissoes";
import { conferirSenha, gerarSenhaProvisoria, hashSenha, SENHA_MIN } from "../senha";
import { encerrarSessoesDoUsuario } from "../sessao";

export const pacienteSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  cpf: z
    .string()
    .transform(soDigitos)
    .refine(cpfValido, "CPF inválido."),
  cns: z
    .string()
    .transform(soDigitos)
    .refine((v) => v === "" || v.length === 15, "Cartão SUS deve ter 15 dígitos.")
    .optional(),
  telefone: z.string().trim().optional(),
  dataNascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida.")
    .optional()
    .or(z.literal("")),
});

export async function criarPaciente(ator: Ator, dados: unknown) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator); // sempre a do gestor logado
  const r = pacienteSchema.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  const v = r.data;
  const senhaProvisoria = gerarSenhaProvisoria();
  try {
    const [u] = await db
      .insert(schema.usuarios)
      .values({
        secretariaId,
        papel: "paciente",
        nome: v.nome,
        cpf: v.cpf,
        cns: v.cns || null,
        telefone: v.telefone || null,
        dataNascimento: v.dataNascimento || null,
        senhaHash: await hashSenha(senhaProvisoria),
        trocarSenha: true,
      })
      .returning({ id: schema.usuarios.id, nome: schema.usuarios.nome, cpf: schema.usuarios.cpf });
    await registrar({ acao: "paciente.criar", usuarioId: ator.id, secretariaId, entidade: "usuario", entidadeId: u.id });
    return { paciente: u, senhaProvisoria };
  } catch (e) {
    traduzirErroBanco(e, { usuarios_secretaria_cpf_uk: "Já existe um paciente com este CPF nesta secretaria." });
  }
}

export async function listarPacientes(ator: Ator, busca?: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const termo = busca?.trim();
  const digitos = termo ? soDigitos(termo) : "";
  return db
    .select({
      id: schema.usuarios.id,
      nome: schema.usuarios.nome,
      cpf: schema.usuarios.cpf,
      telefone: schema.usuarios.telefone,
      ativo: schema.usuarios.ativo,
    })
    .from(schema.usuarios)
    .where(
      and(
        eq(schema.usuarios.secretariaId, secretariaId),
        eq(schema.usuarios.papel, "paciente"),
        termo
          ? or(ilike(schema.usuarios.nome, `%${termo}%`), digitos ? ilike(schema.usuarios.cpf, `%${digitos}%`) : undefined)
          : undefined,
      ),
    )
    .orderBy(asc(schema.usuarios.nome))
    .limit(200);
}

/** Gestor gera nova senha provisória para um paciente DA SUA secretaria. */
export async function redefinirSenhaPaciente(ator: Ator, pacienteId: string) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const senhaProvisoria = gerarSenhaProvisoria();
  const [u] = await db
    .update(schema.usuarios)
    .set({ senhaHash: await hashSenha(senhaProvisoria), trocarSenha: true })
    .where(
      and(
        eq(schema.usuarios.id, pacienteId),
        eq(schema.usuarios.secretariaId, secretariaId),
        eq(schema.usuarios.papel, "paciente"),
      ),
    )
    .returning({ id: schema.usuarios.id });
  if (!u) throw new ErroNegocio("Paciente não encontrado.");
  await encerrarSessoesDoUsuario(u.id);
  await registrar({ acao: "paciente.redefinir_senha", usuarioId: ator.id, secretariaId, entidade: "usuario", entidadeId: u.id });
  return { senhaProvisoria };
}

export async function definirPacienteAtivo(ator: Ator, pacienteId: string, ativo: boolean) {
  exigirPapel(ator, "gestor");
  const secretariaId = secretariaDoAtor(ator);
  const [u] = await db
    .update(schema.usuarios)
    .set({ ativo })
    .where(
      and(
        eq(schema.usuarios.id, pacienteId),
        eq(schema.usuarios.secretariaId, secretariaId),
        eq(schema.usuarios.papel, "paciente"),
      ),
    )
    .returning({ id: schema.usuarios.id });
  if (!u) throw new ErroNegocio("Paciente não encontrado.");
  if (!ativo) await encerrarSessoesDoUsuario(u.id);
  await registrar({ acao: ativo ? "paciente.ativar" : "paciente.desativar", usuarioId: ator.id, secretariaId, entidade: "usuario", entidadeId: u.id });
}

/** Qualquer usuário troca a própria senha. Derruba as outras sessões dele. */
export async function trocarPropriaSenha(ator: Ator, senhaAtual: string, novaSenha: string, tokenAtual?: string) {
  if (novaSenha.length < SENHA_MIN) throw new ErroNegocio(`A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  if (novaSenha === senhaAtual) throw new ErroNegocio("A nova senha precisa ser diferente da atual.");
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, ator.id));
  if (!u || !(await conferirSenha(senhaAtual, u.senhaHash))) throw new ErroNegocio("Senha atual incorreta.");
  await db
    .update(schema.usuarios)
    .set({ senhaHash: await hashSenha(novaSenha), trocarSenha: false })
    .where(eq(schema.usuarios.id, u.id));
  await encerrarSessoesDoUsuario(u.id, tokenAtual);
  await registrar({ acao: "senha.trocar", usuarioId: u.id, secretariaId: u.secretariaId });
}
