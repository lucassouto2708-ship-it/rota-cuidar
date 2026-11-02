import Link from "next/link";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_STATUS_VIAGEM } from "@/lib/apresentacao";
import { listarMotoristas, listarVeiculos } from "@/lib/servicos/frota";
import { listarPacientes } from "@/lib/servicos/usuarios";
import { hojeBr, horaBr, listarViagens } from "@/lib/servicos/viagens";

export default async function PainelGestor() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const hoje = hojeBr();
  const [pacientes, veiculos, motoristas, viagensHoje] = await Promise.all([
    listarPacientes(ator),
    listarVeiculos(ator, { somenteAtivos: true }),
    listarMotoristas(ator, { somenteAtivos: true }),
    listarViagens(ator, { de: hoje, ate: hoje }),
  ]);
  const sec = usuario.secretaria!;
  const passageirosHoje = viagensHoje.reduce((n, v) => n + v.ocupadas, 0);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">TRANSPORTE DE PACIENTES</div><h1>Painel</h1><p>{sec.nome}</p></div>
        <Link className="primary botao-link" href="/gestor/viagens/nova">＋ Nova viagem</Link></div>
      <div className="cards">
        <div className="stat"><div className="stat-top">Viagens hoje</div><div className="stat-num">{viagensHoje.length}</div><div className="stat-note">{passageirosHoje} passageiro(s) · <Link href="/gestor/viagens">Viagens →</Link></div></div>
        <div className="stat"><div className="stat-top">Pacientes cadastrados</div><div className="stat-num">{pacientes.filter((p) => p.ativo).length}</div><div className="stat-note"><Link href="/gestor/pacientes">Pacientes →</Link></div></div>
        <div className="stat"><div className="stat-top">Veículos ativos</div><div className="stat-num">{veiculos.length}</div><div className="stat-note">{veiculos.reduce((n, v) => n + v.vagas, 0)} vagas · {motoristas.length} motorista(s)</div></div>
        <div className="stat"><div className="stat-top">Link dos pacientes</div><div className="stat-num pequeno"><code>/{sec.slug}/entrar</code></div><div className="stat-note">Envie este endereço aos pacientes</div></div>
      </div>
      <div className="panel">
        <div className="panel-title">Saídas de hoje</div>
        {viagensHoje.length === 0 ? <p className="muted">Nenhuma viagem hoje.</p> : (
          <table>
            <thead><tr><th>Saída</th><th>Trecho</th><th>Veículo</th><th>Passageiros</th><th>Situação</th><th></th></tr></thead>
            <tbody>{viagensHoje.map(({ viagem: v, veiculo, ocupadas, vagas }) => (
              <tr key={v.id}>
                <td><b>{horaBr(v.saida)}</b></td>
                <td><span className={`sentido s-${v.sentido}`}>{v.sentido === "ida" ? "IDA" : "VOLTA"}</span> {v.cidadeOrigem} → {v.cidadeDestino}</td>
                <td>{veiculo.nome}</td><td>{ocupadas} / {vagas}</td>
                <td><span className={`status st-${v.status}`}>{NOME_STATUS_VIAGEM[v.status]}</span></td>
                <td className="acoes-linha"><Link href={`/gestor/viagens/${v.id}/lista`}>Conferir embarque</Link></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </Casca>
  );
}
