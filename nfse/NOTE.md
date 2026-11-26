# AM Santos — Calculadora NFS-e (Reels, 1080×1920, 40 s)

**Locução:** o mp3 enviado (39,7 s), usado como veio. **Imagem:** a própria calculadora (`calc/`, cópia do repositório `calculadora-nfse-ibs-cbs`), capturada em estados reais com Playwright e animada por câmera, cursor e destaques. Marca, cores (#142016 / #BED67E / #F4F2EA), fontes (Marcellus, Public Sans) e logo vêm da calculadora.

## A ideia
O vídeo não explica a calculadora: ele a opera. Cada frase da locução vira uma ação na tela: digitar o CNPJ, consultar, informar o valor, ler as linhas do resultado, abrir o comparativo, gerar o PDF.

## Beats (o que cada um faz o espectador acreditar)
| t | locução | na tela | buys |
|---|---|---|---|
| 0–6 s | "R$ 1.000… de R$ 9,00 para R$ 107,00" | R$ 9,00 → R$ 107,00 (contador) | o salto é grande |
| 6–11 s | "reforma tributária… dá para ver antes" | o comparativo real (R$ 9,14 → R$ 107,35, +R$ 98,21), câmera recua até a calculadora | o número tem origem e dá para ver |
| 11–13 s | "Coloca o CNPJ" | digitação real no campo | é simples |
| 13–18,7 s | "identifica a empresa, a atividade, a alíquota de IR" | clique em Consultar; empresa, CNAE e 4,80% em sequência | puxa tudo sozinho |
| 18,7–21 s | "Informa o valor… e pronto" | digitação do valor | só isso |
| 21–26,5 s | "ISS, CBS, IBS, IR e valor líquido" | destaque de cada linha + leitura em texto grande | resultado na hora |
| 26,5–33,3 s | "modo comparar… 2026 e 2027… no seu bolso" | aba Comparar, colunas, delta +R$ 98,21, líquido R$ 856,36 → R$ 794,65 | quanto muda |
| 33,3–36,3 s | "Gera o PDF e manda" | botão e página de impressão real | sai pronto para o cliente |
| 36,3–40 s | "AM Santos… Link na bio" | logo, "Assessoria Tributária", "Link na bio" | quem fala e o que fazer |

## Real × ilustrativo
- **Real:** layout, textos, tabelas, valores e cálculos da calculadora; todos os números de tela saem do código dela. Página de PDF = visão de impressão da própria calculadora.
- **Ilustrativo (declarar):** a consulta de CNPJ. As APIs públicas estavam bloqueadas no ambiente; usei uma resposta simulada para o CNPJ de teste 11.222.333/0001-81, "PRESTADOR EXEMPLO SERVIÇOS LTDA", CNAE 6920-6/01 (a alíquota de 4,80% vem da tabela real `cnae-data.js`). Troque por um CNPJ real se quiser mostrar um prestador verdadeiro.
- Cursor, destaques e leituras em texto grande são camada de montagem.
- Sem música nem efeitos sonoros (sem chave ElevenLabs aqui). Áudio = só a locução (normalizada para ~-14 LUFS).

## Gates
- G0 PASS: 40,00 s, áudio presente.
- G2 PASS: nenhuma sequência > 3 quadros vazios.
- G3 PASS: parada final 0,80 s; plano final 6,13 s = 15 % do filme.
- G5 PASS (`lint.mjs`).
- G1/G4 por inspeção no `look-final/sheet.jpg`: molduras da calculadora cortadas pela borda do quadro; texto pequeno da UI é lido por zoom de câmera e pelas leituras em texto grande; um herói por quadro.
- Movimento: variação média de luma 3,7/255, abaixo da faixa humana (6,8): filme calmo, com trechos de rolagem parados.
- Sincronia de cortes com a locução: 7 de 10 cortes dentro de ±80 ms de um início de som.
- Áudio: locução normalizada para ~-14 LUFS na mixagem final.

## O que eu ainda melhoraria
- Música discreta e cliques sonoros.
- CNPJ real no lugar do simulado.
- Os trechos de rolagem pelo formulário (digitação do CNPJ e valor) são os mais "parados"; dá para cortar mais rápido.
