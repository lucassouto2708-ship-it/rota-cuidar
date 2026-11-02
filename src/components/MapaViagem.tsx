"use client";
import type { AssentoNaViagem } from "@/lib/servicos/reservas";
import { NOME_TIPO_ASSENTO } from "@/lib/layouts";

export type Selecao = Record<string, string>; // assentoId → rótulo curto ("Você", "Acomp.", "Pac.")

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function MapaViagem({
  linhas, colunas, assentos, selecao = {}, onClicar, legenda = true,
}: {
  linhas: number;
  colunas: number;
  assentos: AssentoNaViagem[];
  selecao?: Selecao;
  onClicar?: (a: AssentoNaViagem) => void;
  legenda?: boolean;
}) {
  const mapa = new Map(assentos.map((a) => [`${a.linha},${a.coluna}`, a]));
  return (
    <div className="mapa-viagem">
      <div className="veiculo-desenho">
        <div className="veiculo-frente">FRENTE</div>
        <div className="grade-assentos" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(44px, 56px))` }}>
          {Array.from({ length: linhas }, (_, l) =>
            Array.from({ length: colunas }, (_, c) => {
              if (l === 0 && c === 0) return <div key="m" className="celula motorista" title="Motorista">◎</div>;
              const a = mapa.get(`${l},${c}`);
              if (!a) return <div key={`${l},${c}`} className="celula corredor" aria-hidden />;
              const sel = selecao[a.id];
              const clicavel = !!onClicar && (a.estado === "livre" || !!sel);
              const classe = sel ? "sel" : a.estado === "indisponivel" ? `t-${a.tipo}` : `e-${a.estado}`;
              const titulo = a.passageiro
                ? `Assento ${a.rotulo}: ${a.passageiro.nome}`
                : `Assento ${a.rotulo} · ${a.estado === "indisponivel" ? NOME_TIPO_ASSENTO[a.tipo] : a.estado === "livre" ? `livre (${NOME_TIPO_ASSENTO[a.tipo]})` : a.estado === "meu" ? "sua reserva" : "ocupado"}`;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`celula assento ${classe} ${a.estado === "livre" && a.tipo !== "comum" ? `marca-${a.tipo}` : ""}`}
                  disabled={!clicavel}
                  title={titulo}
                  aria-label={titulo}
                  aria-pressed={!!sel}
                  onClick={() => clicavel && onClicar?.(a)}
                >
                  <span className="rotulo">{a.tipo === "bloqueado" ? "✕" : a.rotulo}</span>
                  {sel && <small>{sel}</small>}
                  {!sel && a.passageiro && <small>{iniciais(a.passageiro.nome)}</small>}
                  {!sel && a.estado === "meu" && <small>Seu</small>}
                </button>
              );
            }),
          )}
        </div>
      </div>
      {legenda && (
        <div className="legenda legenda-linha">
          <span><i className="celula mini-celula e-livre" /> Livre</span>
          <span><i className="celula mini-celula sel" /> Escolhido</span>
          <span><i className="celula mini-celula e-ocupado" /> Ocupado</span>
          <span><i className="celula mini-celula e-meu" /> Sua reserva</span>
          <span><i className="celula mini-celula t-equipe" /> Equipe</span>
        </div>
      )}
    </div>
  );
}
