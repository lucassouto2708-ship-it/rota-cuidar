"use client";
import { useActionState } from "react";
import type { EstadoAcao } from "@/lib/auth";

/** Botão que dispara uma server action, com confirmação opcional e mensagem de erro ao lado. */
export function BotaoAcao({
  acao, texto, confirmar, className = "link",
}: {
  acao: (e: EstadoAcao) => Promise<EstadoAcao>;
  texto: string;
  confirmar?: string;
  className?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  return (
    <form action={enviar} className="inline">
      <button className={className} type="submit" disabled={pendente}
        onClick={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
        {pendente ? "Aguarde…" : texto}
      </button>
      {estado?.erro && <span className="erro-inline" role="alert">{estado.erro}</span>}
    </form>
  );
}
