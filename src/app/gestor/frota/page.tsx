import Link from "next/link";
import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_TIPO_VEICULO } from "@/lib/layouts";
import { formatarPlaca, listarVeiculos } from "@/lib/servicos/frota";
import { acaoCriarVeiculo } from "./actions";

const ICONE = { carro: "🚗", van: "🚐", micro_onibus: "🚌", onibus: "🚌", ambulancia: "🚑", outro: "🚙" } as const;

export default async function Frota() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const veiculos = await listarVeiculos(ator);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">GESTÃO DE VEÍCULOS</div><h1>Frota de veículos</h1><p>Cadastre os veículos e desenhe o mapa de assentos de cada um.</p></div></div>
      <div className="grade-2">
        <div>
          {veiculos.length === 0 ? <div className="panel"><p className="muted">Nenhum veículo cadastrado ainda. Use o formulário ao lado para começar.</p></div> : (
            <div className="vehicle-grid">
              {veiculos.map((v) => (
                <Link key={v.id} href={`/gestor/frota/${v.id}`} className={`vehicle-card ${v.ativo ? "" : "inativo"}`}>
                  <div className="vehicle-card-top">
                    <div className="vehicle-symbol">{ICONE[v.tipo]}</div>
                    {!v.ativo && <span className="status cancel">Inativo</span>}
                    {v.ativo && v.acessivel && <span className="status">♿ Acessível</span>}
                  </div>
                  <h3>{v.nome}</h3>
                  <p>{NOME_TIPO_VEICULO[v.tipo]}{v.placa ? ` · ${formatarPlaca(v.placa)}` : ""}</p>
                  <div className="capacity"><span>Vagas para passageiros</span><b>{v.vagas}</b></div>
                  {v.equipe > 0 && <div className="veh-sub">+ {v.equipe} assento(s) da equipe</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Cadastrar veículo</div>
          <Formulario acao={acaoCriarVeiculo} botao="Cadastrar e montar mapa">
            <div className="field"><label htmlFor="nome">Nome / identificação *</label><input id="nome" name="nome" placeholder="Ex.: Van Renault Master" required /></div>
            <div className="field"><label htmlFor="tipo">Tipo *</label>
              <select id="tipo" name="tipo" defaultValue="van">
                {Object.entries(NOME_TIPO_VEICULO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <span className="hint">O mapa começa com o modelo do tipo escolhido; você ajusta na próxima tela.</span>
            </div>
            <div className="field"><label htmlFor="placa">Placa</label><input id="placa" name="placa" placeholder="ABC-1D23" /></div>
            <label className="check"><input type="checkbox" name="acessivel" /> Veículo acessível (rampa/elevador)</label>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
