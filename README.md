# Rota Cuidar

Sistema de transporte de pacientes para **secretarias de saúde**: frota, viagens de ida e volta, reserva de assento e lista de embarque.
Uma única instalação atende **várias secretarias** (multi-cliente), com os dados de cada uma isolados.

## Níveis de acesso

| Papel | Quem é | Entra por | Pode |
|---|---|---|---|
| **admin** | Você (dono da plataforma) | `/entrar` (e-mail) | Cadastrar secretarias, criar gestores, suspender/reativar uma secretaria |
| **gestor** | Equipe da secretaria | `/entrar` (e-mail) | Frota e mapa de assentos, motoristas, pacientes, viagens, reservas em nome do paciente, lista de embarque com presença e PDF |
| **paciente** | Paciente do SUS | `/<link-da-secretaria>/entrar` (CPF) | Ver viagens abertas, escolher o assento no mapa (com acompanhante, ida e/ou volta), cancelar |

Gestores e pacientes recebem **senha provisória** e são obrigados a trocá-la no primeiro acesso.

## Stack

- **Next.js 15** (App Router, Server Actions) + TypeScript
- **PostgreSQL** + **Drizzle ORM** (migrações SQL versionadas em `drizzle/`)
- Sessões próprias no banco (cookie `httpOnly`; o banco guarda só o hash do token)
- Senhas com bcrypt; bloqueio de 15 min após 5 tentativas erradas
- Testes: Vitest (regras e banco) + Playwright (fluxo completo no navegador)

## Rodando localmente

Requisitos: Node 20+ e PostgreSQL 14+.

```bash
cp .env.example .env          # ajuste DATABASE_URL e DATABASE_URL_TEST
npm install
npm run db:migrate            # cria as tabelas
npm run db:seed               # (opcional) dados de demonstração
npm run dev                   # http://localhost:3000
```

Criar o seu usuário admin (a senha é pedida no terminal):

```bash
npm run admin:create -- "Seu Nome" voce@seudominio.com.br
```

Dados de demonstração (`db:seed`), senha `demo12345`:
- Admin: `admin@demo.com`, em `/entrar`
- Gestores: `gestor@vilaverde.demo` e `gestor@serraalta.demo`, em `/entrar`
- Pacientes: CPF `529.982.247-25` em `/vila-verde/entrar` e CPF `111.444.777-35` em `/serra-alta/entrar`

## Frota e mapa de assentos

- Cada veículo tem uma grade (fileiras × colunas). A célula da frente à esquerda é sempre o **motorista**; células vazias são o corredor.
- Tipos de assento: **comum**, **preferencial** e **cadeirante** (contam como vaga), **equipe de saúde** (não vai para pacientes) e **bloqueado**.
- Ao cadastrar, o veículo já recebe o modelo do tipo escolhido (carro 4, van 15, micro-ônibus 28, ônibus 44, ambulância 2 + 2 da equipe), e o gestor ajusta no editor visual.
- Proteções ao salvar o mapa:
  - os assentos são mantidos pela posição, então as reservas continuam apontando para o mesmo assento;
  - um assento com reserva em viagem futura não pode ser removido nem virar equipe/bloqueado;
  - um assento com reserva só no histórico fica oculto em vez de ser apagado.
- Veículo ou motorista com viagem futura não pode ser inativado.

## Viagens, reservas e lista de embarque

**Viagens (gestor)**
- A ida e a volta são criadas juntas e ficam ligadas. A volta pode ser no mesmo dia ou dias depois, e com outro veículo ou motorista.
- Repetição semanal (ex.: toda terça e quinta até uma data), com no máximo 60 viagens por vez.
- Prazo opcional para os pacientes reservarem; depois dele, só o gestor reserva.
- O mesmo veículo ou motorista não pode ter duas saídas com menos de 60 minutos de diferença.
- O gestor pode encerrar ou reabrir as reservas, cancelar a viagem com motivo (isso cancela todas as reservas) e concluí-la.

**Reservas**
- O paciente escolhe o assento tocando no mapa e pode levar um acompanhante, que ocupa um assento próprio.
- Pode reservar ida, volta ou as duas. Tudo é gravado junto, ou nada é gravado.
- O assento é garantido pelo banco: em uma disputa simultânea, só um passageiro fica com ele.
  - O teste coloca 20 pacientes disputando 4 assentos.
- O paciente não vê os nomes de outros passageiros, só se o assento está livre ou ocupado.
- O paciente não pode ter duas reservas de ida (ou duas de volta) no mesmo dia.
- O gestor reserva em nome de qualquer paciente, troca passageiros de assento e cancela reservas.

**Lista de embarque**
- Tela com os passageiros em ordem de assento, com a coluna "Volta?" para ver quem não vai voltar.
- No dia da viagem, o gestor marca "Embarcou" ou "Faltou", com contadores, e depois conclui a viagem.
- **PDF** (A4 deitado) com a ida e a volta, caixas de presença, linha de assinatura do passageiro e do motorista, e numeração de páginas.
  - Endereço: `/gestor/viagens/<id>/pdf`, ou com `?so=1` para só aquele trecho.

Horários sempre no fuso de Brasília.

## Testes

```bash
npm test          # regras, permissões e garantias do banco (usa DATABASE_URL_TEST, que é APAGADO a cada execução)
npm run test:e2e  # fluxos no navegador (acesso, frota, viagens/reservas/PDF); precisa do app rodando em :3000, do seed e do `pdftotext` (poppler-utils)
```

## Segurança e isolamento entre secretarias

1. **No banco:** toda tabela de negócio tem `secretaria_id`, e as chaves estrangeiras são compostas `(secretaria_id, id)`.
   O Postgres recusa, por exemplo, uma viagem da secretaria A com veículo da B, ou a reserva de um assento que não pertence ao veículo da viagem.
2. **Nos serviços (`src/lib/servicos`):** a secretaria vem **sempre** do usuário logado, nunca do formulário.
3. **Nas páginas e actions:** toda página e toda server action protegida chama `exigir(...)` / `exigirComSenhaDefinitiva(...)` no topo.
4. **Sem duplicidade:** índices únicos parciais impedem dois passageiros no mesmo assento e o mesmo paciente duas vezes na mesma viagem, mesmo com cliques simultâneos.
5. **Auditoria (LGPD):** logins, falhas de login e alterações ficam na tabela `auditoria`.

**Regra para código novo:** todo serviço recebe o `Ator` e filtra por `secretariaDoAtor(ator)`, e cada regra nova ganha um teste em `tests/permissoes.test.ts`.

## Estrutura

```
src/
  app/                  telas (admin/, gestor/, paciente/, entrar/, [slug]/entrar, conta/senha)
  components/           Casca (menu lateral) e Formulario
  db/schema.ts          esquema completo (já inclui veículos, assentos, viagens e reservas)
  lib/                  sessão, login, CPF, senha, permissões, auditoria
  lib/servicos/         regras de negócio por assunto
drizzle/                migrações SQL
scripts/                migrate, seed, create-admin
tests/                  testes (Vitest) e e2e/ (Playwright)
```

## Deploy (Supabase + Vercel)

1. **Supabase:** crie o projeto na região **South America (São Paulo)**. Em *Project Settings → Database* copie:
   - a *Connection string* do **Transaction pooler** (porta 6543), para usar em `DATABASE_URL`;
   - a do **Session pooler** (porta 5432), para usar em `DATABASE_URL_MIGRACAO`;
   - (recomendado) o certificado em *SSL Configuration*, para usar em `DATABASE_CA_CERT`.
2. **Vercel:** importe o repositório do GitHub. O `vercel.json` já define a região São Paulo (`gru1`) e o build (`db:migrate` e depois `build`).
3. Em *Settings → Environment Variables*, com escopo **Production**, crie `DATABASE_URL`, `DATABASE_URL_MIGRACAO`, `DATABASE_CA_CERT` e, só no primeiro deploy, `ADMIN_INICIAL_NOME`, `ADMIN_INICIAL_EMAIL` e `ADMIN_INICIAL_SENHA` (10 ou mais caracteres).
4. Faça o deploy. O build aplica as migrações e cria o admin inicial. Depois de entrar, **apague as variáveis `ADMIN_INICIAL_*`**.
5. Os deploys de *preview* não rodam migrações (não mexem no banco de produção).

**Segurança no Supabase:** a migração `0002` liga o RLS em todas as tabelas e retira o acesso dos papéis `anon` e `authenticated`. Com isso, a API REST automática do Supabase não lê nem grava nada.
O app não é afetado, porque se conecta como dono das tabelas.
**Toda tabela nova precisa de `ENABLE ROW LEVEL SECURITY` na migração dela.** Opcional: desligue a "Data API" em *Project Settings → API*.

## Antes de colocar em produção

- [ ] Seguir a seção **Deploy** acima (o `db:seed` nunca deve ser rodado em produção).
- [ ] Conferir o backup automático do Supabase (no plano gratuito, faça cópias manuais periódicas).
- [ ] Publicar o termo de uso e a política de privacidade (LGPD), indicar o encarregado (DPO) e definir por quanto tempo os dados ficam guardados.
- [ ] Configurar o monitoramento de erros (ex.: Sentry) mascarando os dados pessoais.
- [ ] Próximas melhorias sugeridas:
  - avisos por WhatsApp (confirmação, lembrete na véspera, viagem cancelada);
  - fila de espera quando a viagem lota;
  - relatório mensal de faltas e ocupação;
  - acesso do motorista pelo celular.

## Observações

- `npm audit` aponta avisos em `esbuild` (usado só pelo `drizzle-kit`, ferramenta de desenvolvimento) e em `postcss` (interno ao build do Next).
  Nenhum dos dois roda no app em produção; acompanhe as atualizações do Next e do drizzle-kit.
- Em produção, o cookie de sessão exige HTTPS (`secure`).
