import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Casca } from "@/components/Casca";
import { FormReserva } from "@/components/FormReserva";
import { Formulario } from "@/components/Formulario";
import { MapaViagem } from "@/components/MapaViagem";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_STATUS_VIAGEM, paraDatetimeLocal, tituloViagem, trechoParaForm } from "@/lib/apresentacao";
import { formatarPlaca, listarMotoristas } from "@/lib/servicos/frota";
import { mapaDaViagem, pacientesParaReserva } from "@/lib/servicos/reservas";
import { horaBr, obterViagem } from "@/lib/servicos/viagens";
import {
  acaoCancelarReservaGestor, acaoCancelarViagem, acaoEditarViagem, acaoMoverReserva, acaoReservarPeloGestor, acaoStatusViagem,
} from "../actions";
import { MoverAssento } from "./MoverAssento";

export default async function DetalheViagem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const [{ id }, { nova }] = await Promise.all([params, searchParams]);
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const info = await obterViagem(ator, id);
  if (!info) notFound();
  const { viagem: v, veiculo, motorista, par } = info;
  const [mapa, mapaPar, pacientes, motoristas] = await Promise.all([
    mapaDaViagem(ator, v.id),
    par ? mapaDaViagem(ator, par.id) : null,
    pacientesParaReserva(ator),
    listarMotoristas(ator, { somenteAtivos: true }),
  ]);
  if (!mapa) notFound();
  const ocupados = mapa.assentos.filter((a) => a.passageiro);
  const livres = mapa.assentos.filter((a) => a.estado === "livre");
  const encerrada = v.status === "cancelada" || v.status === "concluida";
  // no formulário de reserva, a IDA vem primeiro
  const [trechoA, trechoB] = v.sentido === "ida" ? [mapa, mapaPar] : [mapaPar ?? mapa, mapaPar ? mapa : null];

  return (
    <Casca usuario={usuario}>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/gestor/viagens">VIAGENS</Link> / {v.sentido === "ida" ? "IDA" : "VOLTA"}</div>
          <h1>{v.cidadeOrigem} → {v.cidadeDestino}</h1>
          <p>{tituloViagem(v)} · {veiculo.nome}{veiculo.placa ? ` (${formatarPlaca(veiculo.placa)})` : ""} · {motorista?.nome ?? "motorista não definido"}</p>
          <p><span className={`status st-${v.status}`}>{NOME_STATUS_VIAGEM[v.status]}</span>
            {par && <> · <Link href={`/gestor/viagens/${par.id}`}>Ver {par.sentido === "volta" ? "a volta" : "a ida"} ({horaBr(par.saida)})</Link></>}</p>
        </div>
        <div className="acoes-topo">
          <Link className="primary botao-link" href={`/gestor/viagens/${v.id}/lista`}>Lista de embarque</Link>
          <a className="outline botao-link" href={`/gestor/viagens/${v.id}/pdf`} target="_blank" rel="noopener">⇩ PDF</a>
        </div>
      </div>
      {nova && <p className="aviso ok-aviso">Viagem criada{par ? " com a volta" : ""}. Os pacientes já podem reservar.</p>}
      {v.status === "cancelada" && <p className="alerta erro" role="status">Esta viagem foi cancelada e as reservas dela também. Avise os passageiros.</p>}
      {v.observacoes && <p className="aviso">{v.observacoes}</p>}

      <div className="grade-2">
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Ocupação · {ocupados.length} de {ocupados.length + livres.length} vagas</div></div>
          <MapaViagem linhas={mapa.veiculo.linhas} colunas={mapa.veiculo.colunas} assentos={mapa.assentos} />
          {ocupados.length > 0 && (
            <table className="tabela-passageiros">
              <thead><tr><th>Assento</th><th>Passageiro</th><th></th></tr></thead>
              <tbody>
                {ocupados.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.rotulo}</b></td>
                    <td>{a.passageiro!.nome}</td>
                    <td className="acoes-linha">
                      {!encerrada && <MoverAssento acao={acaoMoverReserva.bind(null, v.id, a.passageiro!.reservaId)} livres={livres.map((l) => ({ id: l.id, rotulo: l.rotulo }))} />}
                      {!encerrada && <BotaoAcao acao={acaoCancelarReservaGestor.bind(null, v.id, a.passageiro!.reservaId)} texto="Cancelar"
                        confirmar={`Cancelar a reserva de ${a.passageiro!.nome}?${a.passageiro!.acompanhante ? "" : " O acompanhante dele também sai."}`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {!encerrada && (
            <div className="panel">
              <div className="panel-title">Reservar para um paciente</div>
              {pacientes.length === 0 ? <p className="muted">Cadastre pacientes em <Link href="/gestor/pacientes">Pacientes</Link>.</p> : (
                <FormReserva
                  ida={trechoParaForm(trechoA!)} volta={trechoB ? trechoParaForm(trechoB) : null}
                  pacientes={pacientes} acao={acaoReservarPeloGestor.bind(null, v.id)} destino={`/gestor/viagens/${v.id}`} souPaciente={false}
                />
              )}
            </div>
          )}
          {!encerrada && (
            <div className="panel">
              <div className="panel-title">Editar viagem</div>
              <Formulario acao={acaoEditarViagem.bind(null, v.id)} botao="Salvar alterações">
                <div className="linha-campos">
                  <div className="field"><label htmlFor="saida">Saída</label><input id="saida" name="saida" type="time" defaultValue={horaBr(v.saida)} required /></div>
                  <div className="field"><label htmlFor="motoristaId">Motorista</label>
                    <select id="motoristaId" name="motoristaId" defaultValue={v.motoristaId ?? ""}>
                      <option value="">Não definido</option>
                      {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select></div>
                </div>
                <div className="field"><label htmlFor="reservasAte">Pacientes podem reservar até</label><input id="reservasAte" name="reservasAte" type="datetime-local" defaultValue={paraDatetimeLocal(v.reservasAte)} /></div>
                <div className="field"><label htmlFor="observacoes">Observações</label><input id="observacoes" name="observacoes" defaultValue={v.observacoes ?? ""} /></div>
              </Formulario>
              <div className="acoes-viagem">
                {v.status === "aberta" && <BotaoAcao className="outline" acao={acaoStatusViagem.bind(null, v.id, "fechada")} texto="Encerrar reservas" />}
                {v.status === "fechada" && <BotaoAcao className="outline" acao={acaoStatusViagem.bind(null, v.id, "aberta")} texto="Reabrir reservas" />}
              </div>
              <details className="cancelar-viagem">
                <summary>Cancelar esta viagem</summary>
                <Formulario acao={acaoCancelarViagem.bind(null, v.id)} botao="Confirmar cancelamento">
                  <div className="field"><label htmlFor="motivo">Motivo *</label><input id="motivo" name="motivo" required minLength={3} placeholder="Ex.: veículo em manutenção" /></div>
                  <span className="hint">Todas as reservas desta viagem serão canceladas. {par ? "A outra perna (ida/volta) não é cancelada automaticamente." : ""}</span>
                </Formulario>
              </details>
            </div>
          )}
        </div>
      </div>
    </Casca>
  );
}
