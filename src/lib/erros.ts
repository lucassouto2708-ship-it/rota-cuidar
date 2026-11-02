/** Erro de regra de negócio: a mensagem pode ser mostrada ao usuário. */
export class ErroNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroNegocio";
  }
}

/** Usuário sem permissão para a ação. */
export class ErroPermissao extends ErroNegocio {
  constructor(mensagem = "Você não tem permissão para esta ação.") {
    super(mensagem);
    this.name = "ErroPermissao";
  }
}

/** Traduz violações de unicidade do Postgres em mensagens amigáveis. */
export function traduzirErroBanco(e: unknown, mapa: Record<string, string>): never {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = err?.code ?? err?.cause?.code;
  const constraint = err?.constraint ?? err?.cause?.constraint;
  if (code === "23505" && constraint && mapa[constraint]) throw new ErroNegocio(mapa[constraint]);
  throw e;
}
