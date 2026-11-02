import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { diaSemana, tituloViagem } from "@/lib/apresentacao";
import { formatarPlaca } from "@/lib/servicos/frota";
import { minhasReservas, viagensDisponiveis } from "@/lib/servicos/reservas";
import { dataBr, horaBr } from "@/lib/servicos/viagens";
import { acaoCancelarMinhaReserva } from "./actions";

export default async function InicioPaciente({ searchParams }: { searchParams: Promise<{ reservado?: string }> }) {
  const { reservado } = await searchParams;
  const { usuario, ator } = await exigirComSenhaDefinitiva("paciente");
  const [{ proximas, anteriores }, disponiveis] = await Promise.all([minhasReservas(ator), viagensDisponiveis(ator)]);
  const ativas = proximas.filter((r) => r.reserva.status !== "cancelada");
  const canceladasRecentes = proximas.filter((r) => r.reserva.status === "cancelada");
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">ÁREA DO PACIENTE</div><h1>Olá, {usuario.nome.split(" ")[0]}!</h1><p>{usuario.secretaria?.nome}</p></div></div>
      {reservado && <p className="aviso ok-aviso" role="status">Reserva confirmada! Confira abaixo o dia, o horário e o seu assento.</p>}

      <div className="panel">
        <div className="panel-title">Minhas próximas viagens</div>
        {ativas.length === 0 ? <p className="muted">Você não tem viagens reservadas.</p> : (
          <div className="cartoes-reserva">
            {ativas.map((r) => (
              <article key={r.reserva.id} className={`cartao-reserva ${r.viagem.status === "cancelada" ? "cancelada" : ""}`}>
                <div className="cr-topo"><span className={`sentido s-${r.viagem.sentido}`}>{r.viagem.sentido === "ida" ? "IDA" : "VOLTA"}</span>
                  <b>{diaSemana(r.viagem.data)}, {dataBr(r.viagem.data)} · {horaBr(r.viagem.saida)}</b></div>
                <div className="cr-trajeto">{r.viagem.cidadeOrigem} → {r.viagem.cidadeDestino}</div>
                <div className="cr-assento">Assento <b>{r.assento}</b>{r.acompanhante ? <> · Acompanhante {r.acompanhante} no assento <b>{r.acompanhanteAssento}</b></> : null}</div>
                <div className="veh-sub">{r.veiculo.nome}{r.veiculo.placa ? ` · placa ${formatarPlaca(r.veiculo.placa)}` : ""}{r.motorista ? ` · motorista ${r.motorista}` : ""}</div>
                {r.reserva.pontoEmbarque && <div className="veh-sub">Embarque: {r.reserva.pontoEmbarque}</div>}
                <BotaoAcao className="outline perigo mini-btn" acao={acaoCancelarMinhaReserva.bind(null, r.reserva.id)} texto="Cancelar reserva"
                  confirmar={`Cancelar sua reserva de ${r.viagem.sentido} em ${dataBr(r.viagem.data)}?${r.acompanhante ? " O acompanhante também sai." : ""}`} />
              </article>
            ))}
          </div>
        )}
        {canceladasRecentes.length > 0 && (
          <div className="canceladas">
            {canceladasRecentes.map((r) => (
              <p key={r.reserva.id} className="aviso">
                {r.viagem.status === "cancelada" ? "A secretaria cancelou a viagem" : "Reserva cancelada"}: {tituloViagem(r.viagem)}.
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Viagens disponíveis para reservar</div>
        {disponiveis.length === 0 ? <p className="muted">No momento não há viagens abertas para reserva.</p> : (
          <div className="lista-disponiveis">
            {disponiveis.map((d) => (
              <div key={d.viagem.id} className="disponivel">
                <div>
                  <b>{diaSemana(d.viagem.data)}, {dataBr(d.viagem.data)} · saída {horaBr(d.viagem.saida)}</b>
                  <div>{d.viagem.cidadeOrigem} → {d.viagem.cidadeDestino}</div>
                  <div className="veh-sub">
                    {d.veiculo.nome}{d.veiculo.acessivel ? " · ♿ acessível" : ""} · {d.livres} vaga(s){d.volta?.id ? ` · volta ${d.volta.data !== d.viagem.data ? dataBr(d.volta.data) + " " : ""}às ${horaBr(d.volta.saida)} (${d.livresVolta} vaga(s))` : " · sem volta programada"}
                  </div>
                </div>
                {d.jaReservada ? <span className="status">Reservado</span>
                  : d.livres > 0 || (d.livresVolta ?? 0) > 0 ? <Link className="primary botao-link" href={`/paciente/viagens/${d.viagem.id}`}>Reservar</Link>
                  : <span className="status cancel">Lotado</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {anteriores.length > 0 && (
        <div className="panel">
          <div className="panel-title">Viagens anteriores</div>
          <table>
            <tbody>
              {anteriores.slice(0, 10).map((r) => (
                <tr key={r.reserva.id}>
                  <td className="nowrap">{dataBr(r.viagem.data)}</td>
                  <td>{r.viagem.cidadeOrigem} → {r.viagem.cidadeDestino}</td>
                  <td>{r.reserva.status === "cancelada" ? "Cancelada" : r.reserva.embarque === "presente" ? "Embarcou" : r.reserva.embarque === "faltou" ? "Faltou" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Casca>
  );
}
