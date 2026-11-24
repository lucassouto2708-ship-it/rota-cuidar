# Lucas Souto Sites — filme de 36 s

**Fonte do material:** repositório público `lucassouto2708-ship-it/lucas-souto-sites` (o host da Vercel estava bloqueado no container). Textos, cores (#050506 / #FFFFFF / #648CFF), fontes (Fraunces, JetBrains Mono, Inter), foto e nomes de projetos vêm do `index.html` do site. Nada de números ou depoimentos inventados.

## A ideia
O site é feito de colchetes, prompt (`>`), moldura de navegador com sombra dura azul. O filme usa esse vocabulário: o hover do site (overlay + botão azul + sombra que vira azul) é a "prova", e o ator é o cursor.

## Beats (o que cada um faz o espectador acreditar)
| t | beat | buys |
|---|---|---|
| 0–5 s | Hook: "Seu negócio merece um site que **vende** enquanto você dorme." | a promessa, com "vende" como única palavra azul |
| 5–11 s | Marquee + foto do Lucas (cartão com sombra azul) sobre a frase "sem template genérico ✦ sem enrolação" | há uma pessoa, e é sob medida |
| 11–24 s | 3 trabalhos (Lagoa Odontologia, Elora Clinic, WP Contabilidade) com o hover real do site | ele entrega para clínicas, estética, contabilidade |
| 24–31.7 s | Processo: Conversa → Design → Desenvolvimento → No ar | é simples, sem surpresa |
| 31.7–36 s | "Vamos criar o seu site?" + clique em [ chamar no whatsapp ] | próximo passo |

## O que é real e o que é ilustrativo
- Real: copy, nomes e descrições dos projetos, chips, passos do processo, foto, logo textual, botões.
- Ilustrativo: as molduras de navegador dos projetos **não mostram a tela dos sites dos clientes** (não foi possível capturá-los); mostram nome, descrição e chips do portfólio. Se quiser as telas reais, capture-as e substitua o miolo de `#br1..3`.
- Textura ASCII de fundo: referência ao `.ascii-bg` do site, gerada por código.
- Sem voz, sem música, sem SFX (nenhuma chave ElevenLabs neste ambiente).

## Gates (números de `look.py` / `lint.mjs`)
- G0 PASS — 36.00 s, 1080 quadros, sem áudio (não planejado).
- G2 PASS — nenhuma sequência > 3 quadros vazios.
- G3 PASS — fim mantido 0.33 s (termina em movimento); plano final 2.67 s = 7 % do filme.
- G5 PASS — `lint.mjs`: sem chrome de página (avisos restantes: C5 micro-rótulos mono, V4 cinza `#a0a0a8` que é a cor do próprio site).
- G1 e G4 por inspeção no `look/sheet.jpg`: texto de UI ≥ 0.04 H e molduras ≥ 0.55 W nos projetos; um herói por quadro. Não há script para esses dois.
- Movimento: mudança média de luma 3.0/255, abaixo da faixa humana (mediana 6.8). O filme é calmo; os trechos de processo e hover seguram mais.

## O que eu ainda melhoraria
- Telas reais dos três sites nas molduras.
- Trilha e voz (ElevenLabs).
- Mais movimento no processo (cada painel é quase parado).
- Os cortes 5→11 s e 24 s cortam em movimento, mas não verifiquei a olho cada quadro intermediário.
