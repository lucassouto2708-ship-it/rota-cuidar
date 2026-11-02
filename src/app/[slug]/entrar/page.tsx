import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Formulario } from "@/components/Formulario";
import { db, schema } from "@/db";
import { HOME_DO_PAPEL, usuarioAtual } from "@/lib/auth";
import { acaoEntrarPaciente } from "@/app/entrar/actions";

export default async function EntrarPaciente({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [sec] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.slug, slug)).limit(1);
  if (!sec || !sec.ativa) notFound();
  const u = await usuarioAtual();
  if (u) redirect(HOME_DO_PAPEL[u.papel]);
  return (
    <div className="tela-entrar">
      <div className="cartao-entrar">
        <div className="brand"><div className="brand-mark">✚</div><div><strong>Rota Cuidar</strong><small>{sec.municipio} · {sec.uf}</small></div></div>
        <h1>Área do paciente</h1>
        <p className="muted">{sec.nome}</p>
        <Formulario acao={acaoEntrarPaciente.bind(null, sec.slug)} botao="Entrar">
          <div className="field"><label htmlFor="cpf">CPF</label><input id="cpf" name="cpf" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" required /></div>
          <div className="field"><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" required /></div>
        </Formulario>
        <p className="muted pequeno">Esqueceu a senha? Procure a secretaria de saúde para gerar uma nova.</p>
      </div>
    </div>
  );
}
