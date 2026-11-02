/**
 * Traduz erros de conexão com o banco em mensagens claras, SEM expor senha nem endereço completo.
 * Usado pela página /api/saude.
 */
type ErroPg = { code?: string; message?: string };

export type Diagnostico = { ok: false; problema: string; solucao: string; codigo?: string };

export function diagnosticarErroBanco(e: unknown, url = process.env.DATABASE_URL): Diagnostico {
  const err = (e ?? {}) as ErroPg;
  let msg = String(err.message ?? e ?? "");
  // nunca devolve a senha, mesmo se aparecer em alguma mensagem
  try {
    const senha = url ? decodeURIComponent(new URL(url).password) : "";
    if (senha) msg = msg.split(senha).join("***");
  } catch {}
  const tem = (t: string) => msg.toLowerCase().includes(t.toLowerCase());

  if (tem("DATABASE_URL não configurada"))
    return { ok: false, problema: "A variável DATABASE_URL não existe neste deploy.", solucao: "Na Vercel: Settings → Environment Variables → crie DATABASE_URL marcando Production. Depois: Deployments → ⋯ → Redeploy." };
  if (tem("Invalid URL") || err.code === "ERR_INVALID_URL")
    return { ok: false, problema: "O endereço em DATABASE_URL está mal formado.", solucao: "Confira se começa com postgresql:// e se a senha tem só letras e números (sem @ # / ? %). Sem espaços antes ou depois." };
  if (tem("Tenant or user not found") || tem("tenant/user"))
    return { ok: false, problema: "O Supabase não reconheceu o projeto/usuário no endereço.", solucao: "O servidor (região) no endereço não é o do seu projeto. Troque aws-0 por aws-1 (ou vice-versa) na DATABASE_URL e faça Redeploy. Se persistir, confira a região do projeto em Supabase → Project Settings → General e ajuste o trecho sa-east-1." };
  if (err.code === "28P01" || tem("password authentication failed"))
    return { ok: false, problema: "Senha do banco incorreta.", solucao: "No Supabase: Project Settings → Database → Reset database password (só letras e números). Atualize a senha na DATABASE_URL e faça Redeploy." };
  if (err.code === "ENOTFOUND" || tem("getaddrinfo"))
    return { ok: false, problema: "O servidor do banco não foi encontrado (endereço digitado errado).", solucao: "Confira o trecho depois do @: aws-0-sa-east-1.pooler.supabase.com:6543 (ou aws-1-...)." };
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET"].includes(err.code ?? "") || tem("timeout"))
    return { ok: false, problema: "Não foi possível conectar ao servidor do banco.", solucao: "Confira a porta 6543 no fim do endereço e se o projeto no Supabase não está pausado (projetos gratuitos pausam após dias sem uso)." };
  if (err.code === "42P01" || tem("does not exist"))
    return { ok: false, problema: "Conectou, mas as tabelas não existem neste banco.", solucao: "Confira se o ID na DATABASE_URL é o mesmo projeto onde você rodou o 01_estrutura.sql." };
  if (tem("certificate") || tem("SSL"))
    return { ok: false, problema: "Falha na conexão segura (SSL).", solucao: "Se você criou DATABASE_CA_CERT, apague essa variável e faça Redeploy." };
  return { ok: false, problema: "Erro não identificado ao conectar no banco.", solucao: "Envie esta resposta para o suporte técnico.", codigo: `${err.code ?? "?"}: ${msg.slice(0, 200)}` };
}
