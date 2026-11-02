import Link from "next/link";
import type { UsuarioSessao } from "@/lib/sessao";
import { acaoSair } from "@/app/sair/actions";

const MENUS = {
  admin: [{ href: "/admin", rotulo: "Secretarias" }],
  gestor: [
    { href: "/gestor", rotulo: "Painel" },
    { href: "/gestor/frota", rotulo: "Frota" },
    { href: "/gestor/motoristas", rotulo: "Motoristas" },
    { href: "/gestor/pacientes", rotulo: "Pacientes" },
  ],
  paciente: [{ href: "/paciente", rotulo: "Início" }],
} as const;

const NOME_PAPEL = { admin: "Administrador da plataforma", gestor: "Gestor", paciente: "Paciente" } as const;

export function Casca({ usuario, children }: { usuario: UsuarioSessao; children: React.ReactNode }) {
  const iniciais = usuario.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✚</div>
          <div>
            <strong>Rota Cuidar</strong>
            <small>{usuario.secretaria?.municipio ?? "Plataforma"}</small>
          </div>
        </div>
        <div className="nav-label">MENU</div>
        <nav className="nav">
          {MENUS[usuario.papel].map((m) => (
            <Link key={m.href} href={m.href}>{m.rotulo}</Link>
          ))}
          <Link href="/conta/senha">Trocar senha</Link>
        </nav>
        <div className="side-bottom">
          <b>{usuario.nome}</b>
          <span>{NOME_PAPEL[usuario.papel]}{usuario.secretaria ? ` · ${usuario.secretaria.nome}` : ""}</span>
          <form action={acaoSair}>
            <button className="outline sair" type="submit">Sair</button>
          </form>
        </div>
      </aside>
      <main className="content">
        <div className="topbar">
          <div className="crumb">{usuario.secretaria?.nome ?? "Administração"}</div>
          <div className="avatar" title={usuario.nome}>{iniciais}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
