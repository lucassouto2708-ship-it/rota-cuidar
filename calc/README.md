# Calculadora NFS-e: ISSQN, CBS e IBS

Calculadora da AM Santos Assessoria Tributária para comparar o cálculo da NFS-e em 2026 (ano-teste, com PIS/COFINS) e a partir de 2027 (sem PIS/COFINS), com modo comparativo lado a lado.

- IRPJ para empresas fora do Simples (Lucro Presumido ou Lucro Real por estimativa): base = valor do serviço × presunção; IRPJ = base × 15%, com adicional de 10% opcional.
- Consulta de CNPJ do prestador: identifica Simples ou não, lista os CNAEs (principal marcado) e puxa a alíquota de IR pela tabela por CNAE (`cnae-data.js`, a mesma do IRnotas); IR = valor do serviço × alíquota.
- Valor líquido = Base de cálculo IBS/CBS − Total IBS/CBS − IRPJ (ou IR pelo CNAE).
- Gera PDF do cálculo pelo botão "Gerar PDF do cálculo".

Página estática (HTML único), publicada via GitHub Pages.
