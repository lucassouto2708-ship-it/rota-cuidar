"use client";
import Link from "next/link";

/** Tela amigável para erros inesperados (no lugar da mensagem técnica em inglês). */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="tela-entrar">
      <div className="cartao-entrar">
        <div className="brand"><div className="brand-mark">✚</div><div><strong>Rota Cuidar</strong><small>Algo deu errado</small></div></div>
        <h1>Não foi possível concluir</h1>
        <p className="muted">Ocorreu um erro inesperado. Tente de novo em instantes. Se continuar, avise o suporte informando o código abaixo.</p>
        {error.digest && <p><code>Código: {error.digest}</code></p>}
        <div className="form-acoes" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <Link href="/">Ir para o início</Link>
          <button className="primary" type="button" onClick={() => reset()}>Tentar de novo</button>
        </div>
      </div>
    </div>
  );
}
