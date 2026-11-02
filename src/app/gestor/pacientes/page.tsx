import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { formatarCpf } from "@/lib/cpf";
import { listarPacientes } from "@/lib/servicos/usuarios";
import { acaoAlternarPaciente, acaoCriarPaciente, acaoRedefinirSenha } from "../actions";
import { RedefinirSenha } from "./RedefinirSenha";

export default async function Pacientes({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca } = await searchParams;
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const lista = await listarPacientes(ator, busca);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">CADASTRO</div><h1>Pacientes</h1><p>Pacientes que podem reservar vagas nas viagens da secretaria.</p></div></div>
      <div className="grade-2">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Lista ({lista.length})</div>
            <form className="search"><input name="busca" defaultValue={busca} placeholder="Buscar por nome ou CPF…" /></form>
          </div>
          {lista.length === 0 ? <p className="muted">{busca ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado ainda."}</p> : (
            <table>
              <thead><tr><th>Paciente</th><th>CPF</th><th>Telefone</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={p.ativo ? "" : "inativo"}>
                    <td><b>{p.nome}</b></td>
                    <td className="nowrap">{formatarCpf(p.cpf ?? "")}</td>
                    <td>{p.telefone ?? "—"}</td>
                    <td>{p.ativo ? "Ativo" : "Inativo"}</td>
                    <td className="acoes-linha">
                      {p.ativo && <RedefinirSenha acao={acaoRedefinirSenha.bind(null, p.id)} />}
                      <form action={acaoAlternarPaciente.bind(null, p.id, !p.ativo)} className="inline">
                        <button className="link" type="submit">{p.ativo ? "Desativar" : "Reativar"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Novo paciente</div>
          <Formulario acao={acaoCriarPaciente} botao="Cadastrar paciente" limparAoConcluir>
            <div className="field"><label htmlFor="nome">Nome completo *</label><input id="nome" name="nome" required /></div>
            <div className="field"><label htmlFor="cpf">CPF *</label><input id="cpf" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required /></div>
            <div className="field"><label htmlFor="cns">Cartão SUS</label><input id="cns" name="cns" inputMode="numeric" /></div>
            <div className="linha-campos">
              <div className="field"><label htmlFor="telefone">Telefone / WhatsApp</label><input id="telefone" name="telefone" /></div>
              <div className="field"><label htmlFor="dataNascimento">Nascimento</label><input id="dataNascimento" name="dataNascimento" type="date" /></div>
            </div>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
