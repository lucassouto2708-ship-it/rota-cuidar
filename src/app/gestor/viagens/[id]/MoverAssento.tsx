"use client";
import { useActionState, useState } from "react";
import type { EstadoAcao } from "@/lib/auth";

export function MoverAssento({ acao, livres }: { acao: (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>; livres: { id: string; rotulo: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, pendente] = useActionState(acao, null);
  if (!livres.length) return null;
  if (!aberto) return <button type="button" className="link" onClick={() => setAberto(true)}>Trocar assento</button>;
  return (
    <form action={enviar} className="inline">
      <select name="assentoId" aria-label="Novo assento" required defaultValue="">
        <option value="" disabled>Assento…</option>
        {livres.map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}
      </select>
      <button className="link" type="submit" disabled={pendente}>Mover</button>
      {estado?.erro && <span className="erro-inline">{estado.erro}</span>}
    </form>
  );
}
