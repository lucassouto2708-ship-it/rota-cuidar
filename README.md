# Rota Cuidar

Sistema de transporte de pacientes para **secretarias de saúde**: frota, viagens de ida e volta, reserva de assento e lista de embarque.
Uma única instalação atende **várias secretarias** (multi-cliente), com os dados de cada uma isolados.

## Níveis de acesso

| Papel | Quem é | Entra por | Pode |
|---|---|---|---|
| **admin** | Você (dono da plataforma) | `/entrar` (e-mail) | Cadastrar secretarias, criar gestores, suspender/reativar uma secretaria |
| **gestor** | Equipe da secretaria | `/entrar` (e-mail) | Frota com mapa de assentos, motoristas, pacientes (e, nas próximas etapas, viagens e lista de embarque) |
| **paciente** | Paciente do SUS | `/<link-da-secretaria>/entrar` (CPF) | Ver e reservar viagens (próximas etapas) |

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

## Testes

```bash
npm test          # regras, permissões e garantias do banco (usa DATABASE_URL_TEST, que é APAGADO a cada execução)
npm run test:e2e  # fluxos no navegador (acesso + frota); precisa do app rodando em :3000 e do seed aplicado
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

## Observações

- `npm audit` aponta avisos em `esbuild` (usado só pelo `drizzle-kit`, ferramenta de desenvolvimento) e em `postcss` (interno ao build do Next).
  Nenhum dos dois roda no app em produção; acompanhe as atualizações do Next e do drizzle-kit.
- Em produção, o cookie de sessão exige HTTPS (`secure`).
