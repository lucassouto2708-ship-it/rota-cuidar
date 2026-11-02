import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <div className="tela-entrar">
      <div className="cartao-entrar">
        <h1>Página não encontrada</h1>
        <p className="muted">Confira o link recebido da sua secretaria de saúde.</p>
        <Link href="/">Voltar ao início</Link>
      </div>
    </div>
  );
}
