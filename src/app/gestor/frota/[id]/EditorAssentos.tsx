"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { TipoAssento, TipoVeiculo } from "@/db/schema";
import type { EstadoAcao } from "@/lib/auth";
import {
  contarAssentos,
  layoutPadrao,
  LIMITES,
  NOME_TIPO_ASSENTO,
  NOME_TIPO_VEICULO,
  renumerar,
  validarLayout,
  type AssentoLayout,
  type Layout,
} from "@/lib/layouts";

type Ferramenta = TipoAssento | "apagar" | "renomear";

const FERRAMENTAS: { id: Ferramenta; rotulo: string }[] = [
  { id: "comum", rotulo: "Comum" },
  { id: "preferencial", rotulo: "Preferencial" },
  { id: "cadeirante", rotulo: "♿ Cadeirante" },
  { id: "equipe", rotulo: "✚ Equipe" },
  { id: "bloqueado", rotulo: "✕ Bloqueado" },
  { id: "renomear", rotulo: "✎ Renomear" },
  { id: "apagar", rotulo: "Apagar" },
];

const chave = (l: number, c: number) => `${l},${c}`;

function proximoRotulo(assentos: AssentoLayout[]) {
  const usados = new Set(assentos.map((a) => a.rotulo.toUpperCase()));
  let n = 1;
  while (usados.has(String(n))) n++;
  return String(n);
}

export function EditorAssentos({
  inicial,
  tipoVeiculo,
  salvar,
}: {
  inicial: Layout;
  tipoVeiculo: TipoVeiculo;
  salvar: (layout: Layout) => Promise<EstadoAcao>;
}) {
  const [layout, setLayout] = useState<Layout>(inicial);
  const [base, setBase] = useState<Layout>(inicial); // última versão salva
  const [ferramenta, setFerramenta] = useState<Ferramenta>("comum");
  const [estado, setEstado] = useState<EstadoAcao>(null);
  const [salvando, iniciar] = useTransition();

  const mapa = useMemo(() => new Map(layout.assentos.map((a) => [chave(a.linha, a.coluna), a])), [layout]);
  const erro = validarLayout(layout);
  const { vagas, equipe } = contarAssentos(layout.assentos);
  const alterado = JSON.stringify(layout) !== JSON.stringify(base);

  // avisa antes de sair da página com alterações não salvas
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  function mudar(fn: (l: Layout) => Layout) {
    setEstado(null);
    setLayout((l) => fn(l));
  }

  function clicar(linha: number, coluna: number) {
    if (linha === 0 && coluna === 0) return; // motorista
    const atual = mapa.get(chave(linha, coluna));
    if (ferramenta === "apagar") {
      if (atual) mudar((l) => ({ ...l, assentos: l.assentos.filter((a) => a !== atual) }));
      return;
    }
    if (ferramenta === "renomear") {
      if (!atual) return;
      const novo = window.prompt(`Novo nome para o assento ${atual.rotulo} (até ${LIMITES.rotuloMax} caracteres):`, atual.rotulo);
      if (novo === null) return;
      const nome = novo.trim().slice(0, LIMITES.rotuloMax);
      if (nome) mudar((l) => ({ ...l, assentos: l.assentos.map((a) => (a === atual ? { ...a, rotulo: nome } : a)) }));
      return;
    }
    if (atual) {
      mudar((l) => ({ ...l, assentos: l.assentos.map((a) => (a === atual ? { ...a, tipo: ferramenta } : a)) }));
    } else {
      mudar((l) => ({ ...l, assentos: [...l.assentos, { linha, coluna, tipo: ferramenta, rotulo: proximoRotulo(l.assentos) }] }));
    }
  }

  function redimensionar(dLinhas: number, dColunas: number) {
    const linhas = layout.linhas + dLinhas;
    const colunas = layout.colunas + dColunas;
    if (linhas < LIMITES.linhasMin || linhas > LIMITES.linhasMax || colunas < LIMITES.colunasMin || colunas > LIMITES.colunasMax) return;
    const perdidos = layout.assentos.filter((a) => a.linha >= linhas || a.coluna >= colunas);
    if (perdidos.length && !window.confirm(`Isso remove ${perdidos.length} assento(s) da borda. Continuar?`)) return;
    mudar((l) => ({ linhas, colunas, assentos: l.assentos.filter((a) => a.linha < linhas && a.coluna < colunas) }));
  }

  function aplicarModelo() {
    if (!window.confirm(`Substituir o mapa atual pelo modelo padrão de ${NOME_TIPO_VEICULO[tipoVeiculo]}?`)) return;
    mudar(() => layoutPadrao(tipoVeiculo));
  }

  function enviar() {
    iniciar(async () => {
      const r = await salvar(layout);
      setEstado(r);
      if (r?.ok) setBase(layout);
    });
  }

  return (
    <div className="editor">
      <div className="editor-ferramentas" role="toolbar" aria-label="Ferramentas do mapa">
        {FERRAMENTAS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ferramenta f-${f.id} ${ferramenta === f.id ? "ativa" : ""}`}
            aria-pressed={ferramenta === f.id}
            onClick={() => setFerramenta(f.id)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>
      <p className="hint">
        Escolha uma ferramenta e toque nas células. Célula vazia vira assento; em um assento, troca o tipo. Espaços vazios são o corredor.
      </p>

      <div className="editor-corpo">
        <div className="veiculo-desenho">
          <div className="veiculo-frente">FRENTE</div>
          <div className="grade-assentos" style={{ gridTemplateColumns: `repeat(${layout.colunas}, minmax(44px, 56px))` }}>
            {Array.from({ length: layout.linhas }, (_, l) =>
              Array.from({ length: layout.colunas }, (_, c) => {
                if (l === 0 && c === 0)
                  return (
                    <div key="motorista" className="celula motorista" title="Motorista">
                      ◎
                    </div>
                  );
                const a = mapa.get(chave(l, c));
                return (
                  <button
                    key={chave(l, c)}
                    type="button"
                    className={`celula ${a ? `assento t-${a.tipo}` : "vazia"}`}
                    title={a ? `Assento ${a.rotulo} · ${NOME_TIPO_ASSENTO[a.tipo]}` : "Corredor / vazio"}
                    aria-label={a ? `Assento ${a.rotulo}, ${NOME_TIPO_ASSENTO[a.tipo]}` : `Posição vazia fileira ${l + 1} coluna ${c + 1}`}
                    onClick={() => clicar(l, c)}
                  >
                    {a ? (a.tipo === "bloqueado" ? "✕" : a.rotulo) : ""}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <div className="editor-lateral">
          <div className="resumo-assentos">
            <div><b>{vagas}</b> vaga(s) para passageiros</div>
            <div><b>{equipe}</b> assento(s) da equipe</div>
          </div>
          <div className="controle-tamanho">
            <span>Fileiras: {layout.linhas}</span>
            <button type="button" className="outline mini" onClick={() => redimensionar(-1, 0)} aria-label="Remover fileira">−</button>
            <button type="button" className="outline mini" onClick={() => redimensionar(1, 0)} aria-label="Adicionar fileira">+</button>
          </div>
          <div className="controle-tamanho">
            <span>Colunas: {layout.colunas}</span>
            <button type="button" className="outline mini" onClick={() => redimensionar(0, -1)} aria-label="Remover coluna">−</button>
            <button type="button" className="outline mini" onClick={() => redimensionar(0, 1)} aria-label="Adicionar coluna">+</button>
          </div>
          <div className="botoes-coluna">
            <button type="button" className="outline" onClick={() => mudar((l) => ({ ...l, assentos: renumerar(l.assentos) }))}>
              Renumerar em ordem
            </button>
            <button type="button" className="outline" onClick={aplicarModelo}>Usar modelo padrão</button>
            <button type="button" className="outline" disabled={!alterado} onClick={() => mudar(() => base)}>
              Desfazer alterações
            </button>
          </div>
          <div className="legenda">
            {(Object.keys(NOME_TIPO_ASSENTO) as TipoAssento[]).map((t) => (
              <span key={t}><i className={`celula mini-celula t-${t}`} /> {NOME_TIPO_ASSENTO[t]}</span>
            ))}
          </div>
        </div>
      </div>

      {erro && <div className="alerta erro" role="alert">{erro}</div>}
      {estado?.erro && <div className="alerta erro" role="alert">{estado.erro}</div>}
      {estado?.ok && !alterado && <div className="alerta ok" role="status">{estado.ok}</div>}
      <div className="form-acoes">
        {alterado && <span className="aviso-inline">Alterações não salvas</span>}
        <button type="button" className="primary" disabled={!!erro || !alterado || salvando} onClick={enviar}>
          {salvando ? "Salvando…" : "Salvar mapa"}
        </button>
      </div>
    </div>
  );
}
