import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_STATUS_VIAGEM, tituloViagem } from "@/lib/apresentacao";
import { formatarCpf } from "@/lib/cpf";
import { formatarPlaca } from "@/lib/servicos/frota";
import { listaEmbarque } from "@/lib/servicos/reservas";
import { hojeBr, horaBr } from "@/lib/servicos/viagens";
import { acaoEmbarque, acaoStatusViagem } from "../../actions";

export default async function ListaEmbarque({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const l = await listaEmbarque(ator, id);
  if (!l) notFound();
  const { viagem: v } = l;
  const podeMarcar = v.data <= hojeBr() && v.status !== "cancelada";
  return (
    <Casca usuario={usuario}>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/gestor/viagens">VIAGENS</Link> / <Link href={`/gestor/viagens/${v.id}`}>{v.sentido === "ida" ? "IDA" : "VOLTA"}</Link> / LISTA</div>
          <h1>Lista de embarque</h1>
          <p>{tituloViagem(v)}</p>
          <p className="muted">{l.veiculo.nome}{l.veiculo.placa ? ` (${formatarPlaca(l.veiculo.placa)})` : ""} · Motorista: {l.motorista?.nome ?? "não definido"} · <span className={`status st-${v.status}`}>{NOME_STATUS_VIAGEM[v.status]}</span></p>
        </div>
        <div className="acoes-topo">
          <a className="primary botao-link" href={`/gestor/viagens/${v.id}/pdf`} target="_blank" rel="noopener">⇩ Baixar PDF{v.viagemParId ? " (ida e volta)" : ""}</a>
          <a className="outline botao-link" href={`/gestor/viagens/${v.id}/pdf?so=1`} target="_blank" rel="noopener">Só este trecho</a>
        </div>
      </div>

      <div className="cards">
        <div className="stat"><div className="stat-top">Passageiros</div><div className="stat-num">{l.resumo.total}</div></div>
        <div className="stat"><div className="stat-top">Embarcaram</div><div className="stat-num ok-num">{l.resumo.presentes}</div></div>
        <div className="stat"><div className="stat-top">Faltaram</div><div className="stat-num falta-num">{l.resumo.faltas}</div></div>
        <div className="stat"><div className="stat-top">A conferir</div><div className="stat-num">{l.resumo.pendentes}</div></div>
      </div>

      <div className="panel">
        {!podeMarcar && v.status !== "cancelada" && <p className="aviso">A presença pode ser marcada a partir do dia da viagem.</p>}
        {l.passageiros.length === 0 ? <p className="muted">Nenhum passageiro com reserva.</p> : (
          <table>
            <thead><tr><th>Assento</th><th>Passageiro</th><th>Documento</th><th>Telefone</th><th>Embarque / destino</th>{v.viagemParId && <th>{v.sentido === "ida" ? "Volta?" : "Foi na ida?"}</th>}<th>Presença</th></tr></thead>
            <tbody>
              {l.passageiros.map((p) => (
                <tr key={p.reservaId} className={`pres-${p.embarque ?? "pendente"}`}>
                  <td><b>{p.assento}</b></td>
                  <td><b>{p.nome}</b>{p.acompanhanteDe && <div className="veh-sub">Acompanhante de {p.acompanhanteDe}</div>}</td>
                  <td className="nowrap">{p.documento && /^\d{11}$/.test(p.documento) ? formatarCpf(p.documento) : (p.documento ?? "—")}</td>
                  <td className="nowrap">{p.telefone ?? "—"}</td>
                  <td>{p.pontoEmbarque ?? "—"}<div className="veh-sub">{p.localDestino ?? ""}{p.horarioCompromisso ? ` às ${horaBr(p.horarioCompromisso)}` : ""}</div></td>
                  {v.viagemParId && <td>{p.temOutroTrecho ? "Sim" : <b className="falta-num">Não</b>}</td>}
                  <td className="acoes-linha presenca">
                    {podeMarcar ? (
                      p.embarque ? (
                        <>
                          <span className={`status ${p.embarque === "presente" ? "" : "cancel"}`}>{p.embarque === "presente" ? "Embarcou" : "Faltou"}</span>
                          <BotaoAcao acao={acaoEmbarque.bind(null, v.id, p.reservaId, null)} texto="desfazer" />
                        </>
                      ) : (
                        <>
                          <BotaoAcao className="outline mini-btn ok" acao={acaoEmbarque.bind(null, v.id, p.reservaId, "presente")} texto="✓ Embarcou" />
                          <BotaoAcao className="outline mini-btn perigo" acao={acaoEmbarque.bind(null, v.id, p.reservaId, "faltou")} texto="Faltou" />
                        </>
                      )
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {podeMarcar && v.status !== "concluida" && l.resumo.pendentes === 0 && l.resumo.total > 0 && (
          <div className="form-acoes"><BotaoAcao className="primary" acao={acaoStatusViagem.bind(null, v.id, "concluida")} texto="Concluir viagem" /></div>
        )}
      </div>
    </Casca>
  );
}
