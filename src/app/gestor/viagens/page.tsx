import Link from "next/link";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { diaSemana, NOME_STATUS_VIAGEM } from "@/lib/apresentacao";
import { formatarPlaca } from "@/lib/servicos/frota";
import { dataBr, hojeBr, horaBr, listarViagens } from "@/lib/servicos/viagens";

const somar = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const dataValida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function Viagens({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; canceladas?: string; criadas?: string }> }) {
  const sp = await searchParams;
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const de = dataValida(sp.de) ?? hojeBr();
  const ate = dataValida(sp.ate) ?? somar(de, 14);
  const lista = await listarViagens(ator, { de, ate, incluirCanceladas: !!sp.canceladas });
  const porDia = new Map<string, typeof lista>();
  for (const l of lista) porDia.set(l.viagem.data, [...(porDia.get(l.viagem.data) ?? []), l]);
  return (
    <Casca usuario={usuario}>
      <div className="page-head">
        <div><div className="eyebrow">TRANSPORTE DE PACIENTES</div><h1>Viagens</h1><p>Viagens programadas, ocupação e listas de embarque.</p></div>
        <Link className="primary botao-link" href="/gestor/viagens/nova">＋ Nova viagem</Link>
      </div>
      {sp.criadas && <p className="aviso ok-aviso">{sp.criadas} viagens criadas.</p>}
      <form className="panel filtros">
        <div className="field"><label htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={de} /></div>
        <div className="field"><label htmlFor="ate">Até</label><input id="ate" name="ate" type="date" defaultValue={ate} /></div>
        <label className="check"><input type="checkbox" name="canceladas" defaultChecked={!!sp.canceladas} /> Mostrar canceladas</label>
        <button className="outline" type="submit">Filtrar</button>
      </form>
      {lista.length === 0 ? <div className="panel"><p className="muted">Nenhuma viagem no período. <Link href="/gestor/viagens/nova">Criar viagem</Link></p></div> : (
        [...porDia.entries()].map(([data, itens]) => (
          <div className="panel" key={data}>
            <div className="panel-title">{diaSemana(data)}, {dataBr(data)}{data === hojeBr() ? " · hoje" : ""}</div>
            <table>
              <thead><tr><th>Saída</th><th>Trecho</th><th>Veículo / motorista</th><th>Ocupação</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {itens.map(({ viagem: v, veiculo, motorista, vagas, ocupadas }) => {
                  const pct = vagas ? Math.min(100, Math.round((ocupadas / vagas) * 100)) : 0;
                  return (
                    <tr key={v.id} className={v.status === "cancelada" ? "inativo" : ""}>
                      <td><b>{horaBr(v.saida)}</b></td>
                      <td><span className={`sentido s-${v.sentido}`}>{v.sentido === "ida" ? "IDA" : "VOLTA"}</span> {v.cidadeOrigem} → {v.cidadeDestino}</td>
                      <td>{veiculo.nome}{veiculo.placa ? ` · ${formatarPlaca(veiculo.placa)}` : ""}<div className="veh-sub">{motorista ?? "Motorista não definido"}</div></td>
                      <td><div className="seat"><div className="seat-label">{ocupadas} / {vagas}</div><div className="bar"><i className={pct >= 100 ? "full" : pct >= 80 ? "near" : ""} style={{ width: `${pct}%` }} /></div></div></td>
                      <td><span className={`status st-${v.status}`}>{NOME_STATUS_VIAGEM[v.status]}</span></td>
                      <td className="acoes-linha"><Link href={`/gestor/viagens/${v.id}`}>Abrir</Link> · <Link href={`/gestor/viagens/${v.id}/lista`}>Lista</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Casca>
  );
}
