import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigir } from "@/lib/auth";
import { SENHA_MIN } from "@/lib/senha";
import { acaoTrocarSenha } from "./actions";

export default async function TrocarSenha() {
  const { usuario } = await exigir("admin", "gestor", "paciente");
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">MINHA CONTA</div><h1>Trocar senha</h1>
        {usuario.trocarSenha && <p className="aviso">Você está usando uma senha provisória. Crie sua senha para continuar.</p>}
      </div></div>
      <div className="panel estreito">
        <Formulario acao={acaoTrocarSenha} botao="Salvar nova senha">
          <div className="field"><label htmlFor="atual">Senha atual</label><input id="atual" name="atual" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="nova">Nova senha</label><input id="nova" name="nova" type="password" autoComplete="new-password" minLength={SENHA_MIN} required /><span className="hint">Mínimo de {SENHA_MIN} caracteres.</span></div>
          <div className="field"><label htmlFor="confirmacao">Repita a nova senha</label><input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={SENHA_MIN} required /></div>
        </Formulario>
      </div>
    </Casca>
  );
}
