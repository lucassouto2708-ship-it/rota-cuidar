"use client";
import { useState } from "react";
import { Formulario } from "@/components/Formulario";
import type { EstadoAcao } from "@/lib/auth";

type Opcao = { id: string; nome: string; detalhe?: string };
const DIAS = [["seg", "Seg"], ["ter", "Ter"], ["qua", "Qua"], ["qui", "Qui"], ["sex", "Sex"], ["sab", "Sáb"], ["dom", "Dom"]] as const;

export function FormNovaViagem({ veiculos, motoristas, hoje, municipio, acao }: {
  veiculos: Opcao[]; motoristas: Opcao[]; hoje: string; municipio: string;
  acao: (e: EstadoAcao, f: FormData) => Promise<EstadoAcao>;
}) {
  const [comVolta, setComVolta] = useState(true);
  const [repetir, setRepetir] = useState(false);
  const [outroVeiculo, setOutroVeiculo] = useState(false);
  return (
    <Formulario acao={acao} botao="Criar viagem">
      <div className="secao-form">Ida</div>
      <div className="linha-campos">
        <div className="field"><label htmlFor="cidadeOrigem">Saindo de *</label><input id="cidadeOrigem" name="cidadeOrigem" defaultValue={municipio} required /></div>
        <div className="field"><label htmlFor="cidadeDestino">Indo para *</label><input id="cidadeDestino" name="cidadeDestino" placeholder="Ex.: Campinas" required /></div>
      </div>
      <div className="linha-campos">
        <div className="field"><label htmlFor="data">Data *</label><input id="data" name="data" type="date" min={hoje} defaultValue={hoje} required /></div>
        <div className="field"><label htmlFor="saida">Horário de saída *</label><input id="saida" name="saida" type="time" required /></div>
      </div>
      <div className="linha-campos">
        <div className="field"><label htmlFor="veiculoId">Veículo *</label>
          <select id="veiculoId" name="veiculoId" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.detalhe ? ` · ${v.detalhe}` : ""}</option>)}
          </select></div>
        <div className="field"><label htmlFor="motoristaId">Motorista</label>
          <select id="motoristaId" name="motoristaId" defaultValue="">
            <option value="">Definir depois</option>
            {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select></div>
      </div>
      <div className="field"><label htmlFor="reservasAte">Pacientes podem reservar até</label><input id="reservasAte" name="reservasAte" type="datetime-local" />
        <span className="hint">Opcional. Em branco: até a hora da saída. Depois do prazo, só o gestor reserva.</span></div>

      <label className="check"><input type="checkbox" name="comVolta" checked={comVolta} onChange={(e) => setComVolta(e.target.checked)} /> Criar também a volta</label>
      {comVolta && (
        <div className="bloco-opcional">
          <div className="secao-form">Volta</div>
          <div className="linha-campos">
            <div className="field"><label htmlFor="voltaSaida">Horário de saída da volta *</label><input id="voltaSaida" name="voltaSaida" type="time" required /></div>
            <div className="field"><label htmlFor="voltaDiasDepois">Dia da volta</label>
              <select id="voltaDiasDepois" name="voltaDiasDepois" defaultValue="0">
                <option value="0">No mesmo dia</option><option value="1">No dia seguinte</option><option value="2">2 dias depois</option><option value="3">3 dias depois</option>
              </select></div>
          </div>
          <label className="check"><input type="checkbox" checked={outroVeiculo} onChange={(e) => setOutroVeiculo(e.target.checked)} /> Volta com outro veículo ou motorista</label>
          {outroVeiculo && (
            <div className="linha-campos">
              <div className="field"><label htmlFor="voltaVeiculoId">Veículo da volta</label>
                <select id="voltaVeiculoId" name="voltaVeiculoId" defaultValue=""><option value="">O mesmo da ida</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></div>
              <div className="field"><label htmlFor="voltaMotoristaId">Motorista da volta</label>
                <select id="voltaMotoristaId" name="voltaMotoristaId" defaultValue=""><option value="">O mesmo da ida</option>
                  {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
            </div>
          )}
        </div>
      )}

      <label className="check"><input type="checkbox" name="repetir" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} /> Repetir toda semana</label>
      {repetir && (
        <div className="bloco-opcional">
          <div className="dias-semana" role="group" aria-label="Dias da semana">
            {DIAS.map(([v, n]) => <label key={v} className="dia"><input type="checkbox" name="repetirDias" value={v} /> {n}</label>)}
          </div>
          <div className="field"><label htmlFor="repetirAte">Repetir até *</label><input id="repetirAte" name="repetirAte" type="date" min={hoje} required /></div>
          <span className="hint">A data escolhida acima é a primeira viagem. Máximo de 60 viagens por vez.</span>
        </div>
      )}
      <div className="field"><label htmlFor="observacoes">Observações</label><input id="observacoes" name="observacoes" placeholder="Ex.: levar documentos e exames" /></div>
    </Formulario>
  );
}
