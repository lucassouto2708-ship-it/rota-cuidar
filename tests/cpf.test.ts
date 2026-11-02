import { describe, expect, it } from "vitest";
import { cpfValido, formatarCpf } from "@/lib/cpf";

describe("CPF", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });
  it("recusa dígito verificador errado, sequência repetida e tamanho errado", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("1234567890")).toBe(false);
  });
  it("formata", () => expect(formatarCpf("52998224725")).toBe("529.982.247-25"));
});
