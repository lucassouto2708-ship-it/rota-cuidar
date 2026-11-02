"use client";
import { useActionState } from "react";
import type { EstadoAcao } from "@/lib/auth";

export function RedefinirSenha({ acao }: { acao: (e: EstadoAcao) => Promise<EstadoAcao> }) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  return (
    <form action={enviar} className="inline">
      <button className="link" type="submit" disabled={pendente}
        onClick={(e) => { if (!confirm("Gerar uma nova senha provisória? A senha atual deixa de funcionar.")) e.preventDefault(); }}>
        Nova senha
      </button>
      {estado?.senhaProvisoria && <code className="senha-inline">{estado.senhaProvisoria}</code>}
      {estado?.erro && <span className="erro-inline">{estado.erro}</span>}
    </form>
  );
}
