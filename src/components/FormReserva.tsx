"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EstadoAcao } from "@/lib/auth";
import type { AssentoNaViagem } from "@/lib/servicos/reservas";
import { MapaViagem } from "./MapaViagem";

export type TrechoMapa = {
  viagemId: string;
  titulo: string; // "Ida · 12/11 às 06:00 · Vila Verde → Campinas"
  linhas: number;
  colunas: number;
  assentos: AssentoNaViagem[];
  bloqueio: string | null;
};

type Escolha = { p?: string; a?: string };

export function FormReserva({
  ida, volta, pacientes, acao, destino, souPaciente,
}: {
  ida: TrechoMapa;
  volta?: TrechoMapa | null;
  pacientes?: { id: string; nome: string; cpf: string | null }[];
  acao: (dados: unknown) => Promise<EstadoAcao>;
  destino: string;
  souPaciente: boolean;
}) {
  const router = useRouter();
  const voltaDisponivel = !!volta && !volta.bloqueio;
  const [querIda, setQuerIda] = useState(!ida.bloqueio);
  const [querVolta, setQuerVolta] = useState(voltaDisponivel);
  const [comAcomp, setComAcomp] = useState(false);
  const [alvo, setAlvo] = useState<"p" | "a">("p");
  const [escIda, setEscIda] = useState<Escolha>({});
  const [escVolta, setEscVolta] = useState<Escolha>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const quem = souPaciente ? "Você" : "Pac.";

  function clicar(set: (f: (e: Escolha) => Escolha) => void) {
    return (a: AssentoNaViagem) => {
      setErro(null);
      set((e) => {
        if (e.p === a.id) return { ...e, p: undefined };
        if (e.a === a.id) return { ...e, a: undefined };
        if (alvo === "a" && comAcomp) return { ...e, a: a.id };
        // escolhe o do paciente; se já tinha e há acompanhante sem lugar, o próximo clique vai para ele
        if (e.p && comAcomp && !e.a) return { ...e, a: a.id };
        return { ...e, p: a.id };
      });
    };
  }

  const selecao = (e: Escolha) => ({ ...(e.p ? { [e.p]: quem } : {}), ...(comAcomp && e.a ? { [e.a]: "Acomp." } : {}) });

  function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setOk(null);
    const form = ev.currentTarget;
    const f = new FormData(form);
    const trechos: { viagemId: string; e: Escolha; nome: string }[] = [];
    if (querIda) trechos.push({ viagemId: ida.viagemId, e: escIda, nome: "da ida" });
    if (querVolta && volta) trechos.push({ viagemId: volta.viagemId, e: escVolta, nome: "da volta" });
    if (!trechos.length) return setErro("Escolha pelo menos um trecho.");
    for (const t of trechos) {
      if (!t.e.p) return setErro(`Escolha o assento ${souPaciente ? "seu" : "do paciente"} ${t.nome}.`);
      if (comAcomp && !t.e.a) return setErro(`Escolha o assento do acompanhante ${t.nome}.`);
    }
    const trecho = (t: (typeof trechos)[number]) => ({ viagemId: t.viagemId, assentoId: t.e.p, acompanhanteAssentoId: comAcomp ? t.e.a : undefined });
    const dados = {
      pacienteId: f.get("pacienteId") || undefined,
      ida: trecho(trechos[0]),
      volta: trechos[1] ? trecho(trechos[1]) : undefined,
      acompanhanteNome: comAcomp ? f.get("acompanhanteNome") : undefined,
      acompanhanteDocumento: comAcomp ? f.get("acompanhanteDocumento") : undefined,
      pontoEmbarque: f.get("pontoEmbarque"),
      localDestino: f.get("localDestino"),
      horarioCompromisso: f.get("horarioCompromisso"),
    };
    iniciar(async () => {
      const r = await acao(dados);
      if (r?.erro) return setErro(r.erro);
      // limpa para a próxima reserva e atualiza os mapas
      setEscIda({});
      setEscVolta({});
      setComAcomp(false);
      form.reset();
      setOk(r?.ok ?? "Reserva feita.");
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <form className="form form-reserva" onSubmit={enviar}>
      {pacientes && (
        <div className="field">
          <label htmlFor="pacienteId">Paciente *</label>
          <select id="pacienteId" name="pacienteId" required defaultValue="">
            <option value="" disabled>Selecione o paciente…</option>
            {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.cpf ? ` · CPF ${p.cpf.slice(0, 3)}.***.***-${p.cpf.slice(9)}` : ""}</option>)}
          </select>
        </div>
      )}

      <label className="check"><input type="checkbox" checked={comAcomp} onChange={(e) => { setComAcomp(e.target.checked); setAlvo("p"); }} /> Vai com acompanhante</label>
      {comAcomp && (
        <div className="linha-campos">
          <div className="field"><label htmlFor="acompanhanteNome">Nome do acompanhante *</label><input id="acompanhanteNome" name="acompanhanteNome" required minLength={3} /></div>
          <div className="field"><label htmlFor="acompanhanteDocumento">Documento (RG/CPF)</label><input id="acompanhanteDocumento" name="acompanhanteDocumento" /></div>
        </div>
      )}
      {comAcomp && (
        <div className="escolhendo" role="radiogroup" aria-label="Escolhendo assento de">
          <span>Tocar no mapa escolhe o assento:</span>
          <button type="button" className={`ferramenta ${alvo === "p" ? "ativa" : ""}`} aria-pressed={alvo === "p"} onClick={() => setAlvo("p")}>{souPaciente ? "Meu" : "do paciente"}</button>
          <button type="button" className={`ferramenta ${alvo === "a" ? "ativa" : ""}`} aria-pressed={alvo === "a"} onClick={() => setAlvo("a")}>do acompanhante</button>
        </div>
      )}

      <div className="trechos">
        <section className={`trecho ${querIda ? "" : "desligado"}`}>
          <label className="check titulo-trecho">
            <input type="checkbox" checked={querIda} disabled={!!ida.bloqueio} onChange={(e) => setQuerIda(e.target.checked)} /> {ida.titulo}
          </label>
          {ida.bloqueio ? <p className="aviso">{ida.bloqueio}</p> : querIda && (
            <MapaViagem linhas={ida.linhas} colunas={ida.colunas} assentos={ida.assentos} selecao={selecao(escIda)} onClicar={clicar(setEscIda)} />
          )}
        </section>
        {volta && (
          <section className={`trecho ${querVolta ? "" : "desligado"}`}>
            <label className="check titulo-trecho">
              <input type="checkbox" checked={querVolta} disabled={!voltaDisponivel} onChange={(e) => setQuerVolta(e.target.checked)} /> {volta.titulo}
            </label>
            {volta.bloqueio ? <p className="aviso">{volta.bloqueio}</p> : querVolta && (
              <MapaViagem linhas={volta.linhas} colunas={volta.colunas} assentos={volta.assentos} selecao={selecao(escVolta)} onClicar={clicar(setEscVolta)} legenda={false} />
            )}
          </section>
        )}
      </div>

      <div className="linha-campos">
        <div className="field"><label htmlFor="pontoEmbarque">Ponto de embarque</label><input id="pontoEmbarque" name="pontoEmbarque" placeholder="Ex.: Posto de saúde do bairro" /></div>
        <div className="field"><label htmlFor="localDestino">Local de atendimento</label><input id="localDestino" name="localDestino" placeholder="Ex.: Hospital das Clínicas" /></div>
      </div>
      <div className="field curto-200"><label htmlFor="horarioCompromisso">Horário da consulta/exame</label><input id="horarioCompromisso" name="horarioCompromisso" type="time" /></div>

      {erro && <div className="alerta erro" role="alert">{erro}</div>}
      {ok && <div className="alerta ok" role="status">{ok}</div>}
      <div className="form-acoes">
        <button className="primary" type="submit" disabled={enviando}>{enviando ? "Reservando…" : "Confirmar reserva"}</button>
      </div>
    </form>
  );
}
