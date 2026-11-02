import { redirect } from "next/navigation";
import { Formulario } from "@/components/Formulario";
import { HOME_DO_PAPEL, usuarioAtual } from "@/lib/auth";
import { acaoEntrarEquipe } from "./actions";

export const metadata = { title: "Entrar · Rota Cuidar" };

export default async function EntrarEquipe() {
  const u = await usuarioAtual();
  if (u) redirect(HOME_DO_PAPEL[u.papel]);
  return (
    <div className="tela-entrar">
      <div className="cartao-entrar">
        <div className="brand"><div className="brand-mark">✚</div><div><strong>Rota Cuidar</strong><small>Acesso da equipe</small></div></div>
        <h1>Entrar</h1>
        <p className="muted">Para gestores das secretarias e administração da plataforma.</p>
        <Formulario acao={acaoEntrarEquipe} botao="Entrar">
          <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
          <div className="field"><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required /></div>
        </Formulario>
        <p className="muted pequeno">É paciente? Use o link enviado pela sua secretaria de saúde.</p>
      </div>
    </div>
  );
}
