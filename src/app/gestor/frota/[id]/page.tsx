import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_TIPO_VEICULO } from "@/lib/layouts";
import { formatarPlaca, obterVeiculo } from "@/lib/servicos/frota";
import { acaoAlternarVeiculo, acaoAtualizarVeiculo, acaoSalvarLayout } from "../actions";
import { EditorAssentos } from "./EditorAssentos";

export default async function DetalheVeiculo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const [{ id }, { novo }] = await Promise.all([params, searchParams]);
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const v = await obterVeiculo(ator, id);
  if (!v) notFound();
  const layout = {
    linhas: v.layoutLinhas,
    colunas: v.layoutColunas,
    assentos: v.assentos.map(({ linha, coluna, rotulo, tipo }) => ({ linha, coluna, rotulo, tipo })),
  };
  return (
    <Casca usuario={usuario}>
      <div className="page-head">
        <div><div className="eyebrow"><Link href="/gestor/frota">FROTA</Link> / VEÍCULO</div><h1>{v.nome}</h1>
          <p>{NOME_TIPO_VEICULO[v.tipo]}{v.placa ? ` · ${formatarPlaca(v.placa)}` : ""}{v.ativo ? "" : " · INATIVO"}</p></div>
        <BotaoAcao acao={acaoAlternarVeiculo.bind(null, v.id, !v.ativo)} texto={v.ativo ? "Inativar veículo" : "Reativar veículo"}
          className={v.ativo ? "outline perigo" : "primary"}
          confirmar={v.ativo ? "Inativar este veículo? Ele deixa de aparecer para novas viagens (o histórico é mantido)." : undefined} />
      </div>
      {novo && <p className="aviso">Veículo cadastrado com o mapa padrão. Confira os assentos abaixo e ajuste se precisar.</p>}
      <div className="grade-2">
        <div className="panel">
          <div className="panel-title">Mapa de assentos</div>
          <EditorAssentos inicial={layout} tipoVeiculo={v.tipo} salvar={acaoSalvarLayout.bind(null, v.id)} />
        </div>
        <div className="panel">
          <div className="panel-title">Dados do veículo</div>
          <Formulario acao={acaoAtualizarVeiculo.bind(null, v.id)} botao="Salvar dados">
            <div className="field"><label htmlFor="nome">Nome / identificação *</label><input id="nome" name="nome" defaultValue={v.nome} required /></div>
            <div className="field"><label htmlFor="tipo">Tipo *</label>
              <select id="tipo" name="tipo" defaultValue={v.tipo}>
                {Object.entries(NOME_TIPO_VEICULO).map(([val, n]) => <option key={val} value={val}>{n}</option>)}
              </select></div>
            <div className="field"><label htmlFor="placa">Placa</label><input id="placa" name="placa" defaultValue={formatarPlaca(v.placa)} /></div>
            <label className="check"><input type="checkbox" name="acessivel" defaultChecked={v.acessivel} /> Veículo acessível (rampa/elevador)</label>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
