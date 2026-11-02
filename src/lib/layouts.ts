/**
 * Mapa de assentos: regras puras (sem banco), usadas no editor (navegador) e no servidor.
 * A grade tem `linhas` x `colunas`; a célula (0,0) é sempre o MOTORISTA (frente, à esquerda).
 */
import type { TipoAssento, TipoVeiculo } from "@/db/schema";

export type AssentoLayout = { linha: number; coluna: number; rotulo: string; tipo: TipoAssento };
export type Layout = { linhas: number; colunas: number; assentos: AssentoLayout[] };

export const LIMITES = { linhasMin: 1, linhasMax: 20, colunasMin: 2, colunasMax: 6, assentosMax: 80, rotuloMax: 6 } as const;

/** Tipos que contam como vaga para paciente/acompanhante. */
export const TIPOS_RESERVAVEIS: TipoAssento[] = ["comum", "preferencial", "cadeirante"];

export const NOME_TIPO_ASSENTO: Record<TipoAssento, string> = {
  comum: "Comum",
  preferencial: "Preferencial",
  cadeirante: "Cadeirante",
  equipe: "Equipe de saúde",
  bloqueado: "Bloqueado",
};

export const NOME_TIPO_VEICULO: Record<TipoVeiculo, string> = {
  carro: "Carro",
  van: "Van",
  micro_onibus: "Micro-ônibus",
  onibus: "Ônibus",
  ambulancia: "Ambulância",
  outro: "Outro",
};

export function contarAssentos(assentos: Pick<AssentoLayout, "tipo">[]) {
  const vagas = assentos.filter((a) => TIPOS_RESERVAVEIS.includes(a.tipo)).length;
  const equipe = assentos.filter((a) => a.tipo === "equipe").length;
  return { vagas, equipe };
}

/** Numera os assentos (exceto bloqueados) da frente para trás, da esquerda para a direita. */
export function renumerar(assentos: AssentoLayout[]): AssentoLayout[] {
  const ordenados = [...assentos].sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
  let n = 0;
  return ordenados.map((a) => ({ ...a, rotulo: a.tipo === "bloqueado" ? `X${a.linha}${a.coluna}` : String(++n) }));
}

/** Monta uma grade com o corredor na coluna `corredor` (ou sem corredor se null). */
function grade(linhas: number, colunas: number, corredor: number | null, totalVagas: number): Layout {
  const assentos: AssentoLayout[] = [];
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c < colunas; c++) {
      if (l === 0 && c === 0) continue; // motorista
      if (c === corredor && l > 0) continue;
      if (l === 0 && c === corredor) continue;
      if (assentos.length >= totalVagas) break;
      assentos.push({ linha: l, coluna: c, rotulo: "", tipo: "comum" });
    }
  return { linhas, colunas, assentos: renumerar(assentos) };
}

/** Modelos prontos para começar; o gestor ajusta no editor. */
export function layoutPadrao(tipo: TipoVeiculo): Layout {
  switch (tipo) {
    case "carro": // motorista + 1 na frente + 3 atrás
      return {
        linhas: 2,
        colunas: 3,
        assentos: renumerar([
          { linha: 0, coluna: 2, rotulo: "", tipo: "comum" },
          { linha: 1, coluna: 0, rotulo: "", tipo: "comum" },
          { linha: 1, coluna: 1, rotulo: "", tipo: "comum" },
          { linha: 1, coluna: 2, rotulo: "", tipo: "comum" },
        ]),
      };
    case "van": // 15 passageiros: 2 na frente + 13 atrás (4 fileiras de 3 + 1)
      return grade(6, 4, 2, 15);
    case "micro_onibus":
      return grade(8, 5, 2, 28);
    case "onibus":
      return grade(12, 5, 2, 44);
    case "ambulancia": {
      // 1 acompanhante na frente, 2 na equipe (atrás) e 1 paciente (maca)
      const a: AssentoLayout[] = [
        { linha: 0, coluna: 1, rotulo: "", tipo: "comum" },
        { linha: 1, coluna: 0, rotulo: "", tipo: "equipe" },
        { linha: 1, coluna: 1, rotulo: "", tipo: "equipe" },
        { linha: 2, coluna: 0, rotulo: "", tipo: "cadeirante" },
      ];
      return { linhas: 3, colunas: 2, assentos: renumerar(a) };
    }
    default:
      return grade(4, 4, 2, 10);
  }
}

/** Valida o layout. Devolve a primeira mensagem de erro, ou null se estiver tudo certo. */
export function validarLayout(l: Layout): string | null {
  if (!Number.isInteger(l.linhas) || l.linhas < LIMITES.linhasMin || l.linhas > LIMITES.linhasMax)
    return `O número de fileiras deve ficar entre ${LIMITES.linhasMin} e ${LIMITES.linhasMax}.`;
  if (!Number.isInteger(l.colunas) || l.colunas < LIMITES.colunasMin || l.colunas > LIMITES.colunasMax)
    return `O número de colunas deve ficar entre ${LIMITES.colunasMin} e ${LIMITES.colunasMax}.`;
  if (l.assentos.length > LIMITES.assentosMax) return `Máximo de ${LIMITES.assentosMax} assentos por veículo.`;
  const posicoes = new Set<string>();
  const rotulos = new Set<string>();
  for (const a of l.assentos) {
    if (!Number.isInteger(a.linha) || !Number.isInteger(a.coluna) || a.linha < 0 || a.coluna < 0 || a.linha >= l.linhas || a.coluna >= l.colunas)
      return "Há assento fora da grade.";
    if (a.linha === 0 && a.coluna === 0) return "A posição do motorista não pode ter assento.";
    if (!(a.tipo in NOME_TIPO_ASSENTO)) return "Tipo de assento inválido.";
    const rotulo = a.rotulo.trim();
    if (!rotulo) return "Todo assento precisa de um número/nome.";
    if (rotulo.length > LIMITES.rotuloMax) return `O nome do assento deve ter no máximo ${LIMITES.rotuloMax} caracteres.`;
    const pos = `${a.linha},${a.coluna}`;
    if (posicoes.has(pos)) return "Dois assentos na mesma posição.";
    if (rotulos.has(rotulo.toUpperCase())) return `O assento "${rotulo}" aparece repetido.`;
    posicoes.add(pos);
    rotulos.add(rotulo.toUpperCase());
  }
  if (contarAssentos(l.assentos).vagas < 1) return "O veículo precisa ter pelo menos 1 assento para passageiro.";
  return null;
}
