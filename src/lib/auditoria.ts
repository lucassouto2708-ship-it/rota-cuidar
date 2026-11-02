import { db, schema } from "@/db";

export async function registrar(evento: {
  acao: string;
  usuarioId?: string | null;
  secretariaId?: string | null;
  entidade?: string;
  entidadeId?: string;
  dados?: Record<string, unknown>;
  ip?: string | null;
}) {
  await db.insert(schema.auditoria).values({
    acao: evento.acao,
    usuarioId: evento.usuarioId ?? null,
    secretariaId: evento.secretariaId ?? null,
    entidade: evento.entidade,
    entidadeId: evento.entidadeId,
    dados: evento.dados,
    ip: evento.ip ?? null,
  });
}
