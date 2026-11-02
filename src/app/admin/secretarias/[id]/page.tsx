import Link from "next/link";
import { notFound } from "next/navigation";
import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { listarGestores, obterSecretaria } from "@/lib/servicos/secretarias";
import { acaoAlternarSecretaria, acaoCriarGestor } from "../../actions";

export default async function DetalheSecretaria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { usuario, ator } = await exigirComSenhaDefinitiva("admin");
  const sec = await obterSecretaria(ator, id);
  if (!sec) notFound();
  const gestores = await listarGestores(ator, sec.id);
  return (
    <Casca usuario={usuario}>
      <div className="page-head">
        <div><div className="eyebrow"><Link href="/admin">SECRETARIAS</Link> / {sec.municipio.toUpperCase()}</div><h1>{sec.nome}</h1>
          <p>{sec.municipio} · {sec.uf} · link dos pacientes: <code>/{sec.slug}/entrar</code></p></div>
        <form action={acaoAlternarSecretaria.bind(null, sec.id, !sec.ativa)}>
          <button className={sec.ativa ? "outline perigo" : "primary"} type="submit">{sec.ativa ? "Suspender acesso" : "Reativar acesso"}</button>
        </form>
      </div>
      {!sec.ativa && <p className="aviso">Acesso suspenso: gestores e pacientes desta secretaria não conseguem entrar. Os dados continuam guardados.</p>}
      <div className="grade-2">
        <div className="panel">
          <div className="panel-title">Gestores ({gestores.length})</div>
          {gestores.length === 0 ? <p className="muted">Cadastre o primeiro gestor para a secretaria começar a usar.</p> : (
            <table><thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th></tr></thead>
              <tbody>{gestores.map((g) => <tr key={g.id}><td>{g.nome}</td><td>{g.email}</td><td>{g.ativo ? "Ativo" : "Inativo"}</td></tr>)}</tbody></table>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Novo gestor</div>
          <Formulario acao={acaoCriarGestor.bind(null, sec.id)} botao="Cadastrar gestor" limparAoConcluir>
            <div className="field"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" required /></div>
            <div className="field"><label htmlFor="email">E-mail (login)</label><input id="email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" /></div>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
