import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";

export default async function InicioPaciente() {
  const { usuario } = await exigirComSenhaDefinitiva("paciente");
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow">ÁREA DO PACIENTE</div><h1>Olá, {usuario.nome.split(" ")[0]}!</h1><p>{usuario.secretaria?.nome}</p></div></div>
      <div className="panel"><div className="panel-title">Minhas viagens</div><p className="muted">Em breve você poderá ver as viagens disponíveis e reservar seu lugar por aqui.</p></div>
    </Casca>
  );
}
