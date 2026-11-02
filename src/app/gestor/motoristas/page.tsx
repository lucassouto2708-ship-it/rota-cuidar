import { BotaoAcao } from "@/components/BotaoAcao";
import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { listarMotoristas } from "@/lib/servicos/frota";
import { acaoAlternarMotorista, acaoCriarMotorista } from "../frota/actions";

export default async function Motoristas() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const lista = await listarMotoristas(ator);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">EQUIPE</div><h1>Motoristas</h1><p>Motoristas que podem ser escalados nas viagens.</p></div></div>
      <div className="grade-2">
        <div className="panel">
          <div className="panel-title">Motoristas ({lista.length})</div>
          {lista.length === 0 ? <p className="muted">Nenhum motorista cadastrado ainda.</p> : (
            <table>
              <thead><tr><th>Nome</th><th>Telefone</th><th>CNH</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className={m.ativo ? "" : "inativo"}>
                    <td><b>{m.nome}</b></td><td>{m.telefone ?? "—"}</td><td className="nowrap">{m.cnh ?? "—"}</td>
                    <td>{m.ativo ? "Ativo" : "Inativo"}</td>
                    <td className="acoes-linha"><BotaoAcao acao={acaoAlternarMotorista.bind(null, m.id, !m.ativo)} texto={m.ativo ? "Inativar" : "Reativar"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Novo motorista</div>
          <Formulario acao={acaoCriarMotorista} botao="Cadastrar motorista" limparAoConcluir>
            <div className="field"><label htmlFor="nome">Nome completo *</label><input id="nome" name="nome" required /></div>
            <div className="field"><label htmlFor="telefone">Telefone / WhatsApp</label><input id="telefone" name="telefone" /></div>
            <div className="field"><label htmlFor="cnh">Nº da CNH</label><input id="cnh" name="cnh" inputMode="numeric" /></div>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
