import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const CUSTO = 11;
export const SENHA_MIN = 8;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

/** Hash fixo usado quando o usuário não existe, para o tempo de resposta não revelar isso. */
export const HASH_FICTICIO = bcrypt.hashSync("senha-ficticia-rota-cuidar", CUSTO);

/** Senha provisória fácil de ditar por telefone (sem 0/O, 1/l/I). */
export function gerarSenhaProvisoria(tamanho = 10): string {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < tamanho; i++) s += alfabeto[randomInt(alfabeto.length)];
  return s;
}
