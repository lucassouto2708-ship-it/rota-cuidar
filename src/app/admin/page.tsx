import Link from "next/link";
import { Casca } from "@/components/Casca";
import { Formulario } from "@/components/Formulario";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { listarSecretarias } from "@/lib/servicos/secretarias";
import { acaoCriarSecretaria } from "./actions";

export default async function PainelAdmin() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("admin");
  const lista = await listarSecretarias(ator);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</div><h1>Secretarias de saúde</h1><p>Cada secretaria é um cliente, com frota, gestores e pacientes separados.</p></div></div>
      <div className="grade-2">
        <div className="panel">
          <div className="panel-title">Clientes ({lista.length})</div>
          {lista.length === 0 ? <p className="muted">Nenhuma secretaria cadastrada ainda.</p> : (
            <table>
              <thead><tr><th>Secretaria</th><th>Link</th><th>Gestores</th><th>Pacientes</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map(({ secretaria: s, gestores, pacientes }) => (
                  <tr key={s.id}>
                    <td><Link href={`/admin/secretarias/${s.id}`}><b>{s.nome}</b></Link><div className="veh-sub">{s.municipio} · {s.uf}</div></td>
                    <td><code>/{s.slug}/entrar</code></td>
                    <td>{gestores}</td>
                    <td>{pacientes}</td>
                    <td><span className={`status ${s.ativa ? "" : "cancel"}`}>{s.ativa ? "Ativa" : "Suspensa"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Nova secretaria</div>
          <Formulario acao={acaoCriarSecretaria} botao="Cadastrar secretaria" limparAoConcluir>
            <div className="field"><label htmlFor="nome">Nome</label><input id="nome" name="nome" placeholder="Secretaria Municipal de Saúde de…" required /></div>
            <div className="linha-campos">
              <div className="field"><label htmlFor="municipio">Município</label><input id="municipio" name="municipio" required /></div>
              <div className="field curto"><label htmlFor="uf">UF</label><input id="uf" name="uf" maxLength={2} required /></div>
            </div>
            <div className="field"><label htmlFor="slug">Link de acesso dos pacientes</label><input id="slug" name="slug" placeholder="campinas-sp" pattern="[a-z0-9]+(-[a-z0-9]+)*" required /><span className="hint">Letras minúsculas, números e hífen. Vira o endereço: /campinas-sp/entrar</span></div>
          </Formulario>
        </div>
      </div>
    </Casca>
  );
}
