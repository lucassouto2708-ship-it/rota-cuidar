"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { EstadoAcao } from "@/lib/auth";

type Props = {
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
  children: React.ReactNode;
  botao: string;
  /** Limpa os campos só quando a ação dá certo (em caso de erro, mantém o que foi digitado). */
  limparAoConcluir?: boolean;
  className?: string;
};

export function Formulario({ acao, children, botao, limparAoConcluir, className }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (limparAoConcluir && estado?.ok) ref.current?.reset();
  }, [estado, limparAoConcluir]);

  // Envia via onSubmit (e não `action=`) porque o React 19 limpa o formulário
  // automaticamente após `action=`, o que apagaria os dados quando há erro.
  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => enviar(dados));
  }

  return (
    <form ref={ref} onSubmit={aoEnviar} className={className ?? "form"}>
      {children}
      {estado?.erro && (
        <div className="alerta erro" role="alert">
          {estado.erro}
        </div>
      )}
      {estado?.ok && (
        <div className="alerta ok" role="status">
          {estado.ok}
          {estado.senhaProvisoria && (
            <div className="senha-provisoria">
              Senha provisória: <code>{estado.senhaProvisoria}</code>
              <small>
                Anote e entregue à pessoa. Ela não será mostrada de novo; no primeiro acesso, o sistema pede para
                trocar.
              </small>
            </div>
          )}
        </div>
      )}
      <div className="form-acoes">
        <button className="primary" type="submit" disabled={pendente}>
          {pendente ? "Aguarde…" : botao}
        </button>
      </div>
    </form>
  );
}
