import Link from "next/link";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { listarMotoristas, listarVeiculos } from "@/lib/servicos/frota";
import { listarPacientes } from "@/lib/servicos/usuarios";

export default async function PainelGestor() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const [pacientes, veiculos, motoristas] = await Promise.all([
    listarPacientes(ator),
    listarVeiculos(ator, { somenteAtivos: true }),
    listarMotoristas(ator, { somenteAtivos: true }),
  ]);
  const sec = usuario.secretaria!;
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">TRANSPORTE DE PACIENTES</div><h1>Painel</h1><p>{sec.nome}</p></div></div>
      <div className="cards">
        <div className="stat"><div className="stat-top">Pacientes cadastrados</div><div className="stat-num">{pacientes.filter((p) => p.ativo).length}</div><div className="stat-note"><Link href="/gestor/pacientes">Gerenciar pacientes →</Link></div></div>
        <div className="stat"><div className="stat-top">Veículos ativos</div><div className="stat-num">{veiculos.length}</div><div className="stat-note">{veiculos.reduce((n, v) => n + v.vagas, 0)} vagas no total · <Link href="/gestor/frota">Frota →</Link></div></div>
        <div className="stat"><div className="stat-top">Motoristas ativos</div><div className="stat-num">{motoristas.length}</div><div className="stat-note"><Link href="/gestor/motoristas">Motoristas →</Link></div></div>
        <div className="stat"><div className="stat-top">Link de acesso dos pacientes</div><div className="stat-num pequeno"><code>/{sec.slug}/entrar</code></div><div className="stat-note">Envie este endereço aos pacientes</div></div>
      </div>
      <div className="panel"><div className="panel-title">Próximos passos</div><p className="muted">Viagens de ida e volta, reservas dos pacientes e a lista de embarque em PDF chegam nas próximas etapas.</p></div>
    </Casca>
  );
}
