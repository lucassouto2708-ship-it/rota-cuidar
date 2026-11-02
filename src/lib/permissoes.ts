import type { Papel } from "@/db/schema";
import { ErroPermissao } from "./erros";

/** O mínimo que os serviços precisam saber de quem está agindo. */
export type Ator = { id: string; papel: Papel; secretariaId: string | null };

export function exigirPapel(ator: Ator, ...papeis: Papel[]) {
  if (!papeis.includes(ator.papel)) throw new ErroPermissao();
}

/** Gestor/paciente: devolve a secretaria DELE. Nunca use um id vindo do formulário. */
export function secretariaDoAtor(ator: Ator): string {
  if (!ator.secretariaId) throw new ErroPermissao("Usuário sem secretaria vinculada.");
  return ator.secretariaId;
}
