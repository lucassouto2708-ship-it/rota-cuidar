import { describe, expect, it } from "vitest";
import { contarAssentos, layoutPadrao, renumerar, validarLayout, type Layout } from "@/lib/layouts";

describe("modelos de mapa de assentos", () => {
  it.each([
    ["carro", 4, 0],
    ["van", 15, 0],
    ["micro_onibus", 28, 0],
    ["onibus", 44, 0],
    ["ambulancia", 2, 2],
  ] as const)("%s: %i vagas e %i da equipe, e o modelo é válido", (tipo, vagas, equipe) => {
    const l = layoutPadrao(tipo);
    expect(validarLayout(l)).toBeNull();
    expect(contarAssentos(l.assentos)).toEqual({ vagas, equipe });
    expect(l.assentos.some((a) => a.linha === 0 && a.coluna === 0)).toBe(false); // motorista
  });

  it("renumera da frente para trás, sem numerar os bloqueados", () => {
    const r = renumerar([
      { linha: 1, coluna: 1, rotulo: "", tipo: "comum" },
      { linha: 0, coluna: 2, rotulo: "", tipo: "comum" },
      { linha: 1, coluna: 0, rotulo: "", tipo: "bloqueado" },
    ]);
    expect(r.map((a) => a.rotulo)).toEqual(["1", "X10", "2"]);
  });

  it("recusa layouts inválidos", () => {
    const base: Layout = { linhas: 2, colunas: 3, assentos: [{ linha: 0, coluna: 1, rotulo: "1", tipo: "comum" }] };
    expect(validarLayout(base)).toBeNull();
    expect(validarLayout({ ...base, assentos: [{ linha: 0, coluna: 0, rotulo: "1", tipo: "comum" }] })).toMatch(/motorista/);
    expect(validarLayout({ ...base, assentos: [{ linha: 5, coluna: 1, rotulo: "1", tipo: "comum" }] })).toMatch(/fora da grade/);
    expect(validarLayout({ ...base, assentos: [...base.assentos, { linha: 1, coluna: 1, rotulo: "1", tipo: "comum" }] })).toMatch(/repetido/);
    expect(validarLayout({ ...base, assentos: [...base.assentos, { linha: 0, coluna: 1, rotulo: "2", tipo: "comum" }] })).toMatch(/mesma posição/);
    expect(validarLayout({ ...base, assentos: [{ linha: 0, coluna: 1, rotulo: "1", tipo: "equipe" }] })).toMatch(/pelo menos 1/);
    expect(validarLayout({ ...base, assentos: [{ linha: 0, coluna: 1, rotulo: " ", tipo: "comum" }] })).toMatch(/precisa de um/);
    expect(validarLayout({ ...base, colunas: 9 })).toMatch(/colunas/);
    expect(validarLayout({ ...base, assentos: [{ linha: 0, coluna: 1, rotulo: "1", tipo: "vip" as never }] })).toMatch(/Tipo/);
  });
});
