import Link from "next/link";
import { notFound } from "next/navigation";
import { Casca } from "@/components/Casca";
import { FormReserva } from "@/components/FormReserva";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { trechoParaForm } from "@/lib/apresentacao";
import { mapaDaViagem } from "@/lib/servicos/reservas";
import { acaoReservar } from "../../actions";

export default async function ReservarViagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { usuario, ator } = await exigirComSenhaDefinitiva("paciente");
  const ida = await mapaDaViagem(ator, id);
  if (!ida || ida.viagem.sentido !== "ida") notFound();
  const volta = ida.viagem.viagemParId ? await mapaDaViagem(ator, ida.viagem.viagemParId) : null;
  const jaTemIda = ida.assentos.some((a) => a.estado === "meu");
  const jaTemVolta = volta?.assentos.some((a) => a.estado === "meu");
  const trechoIda = trechoParaForm(ida);
  const trechoVolta = volta ? trechoParaForm(volta) : null;
  if (jaTemIda) trechoIda.bloqueio = "Você já tem reserva nesta ida.";
  if (trechoVolta && jaTemVolta) trechoVolta.bloqueio = "Você já tem reserva nesta volta.";
  const nadaDisponivel = !!trechoIda.bloqueio && (!trechoVolta || !!trechoVolta.bloqueio);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow"><Link href="/paciente">INÍCIO</Link> / RESERVAR</div>
        <h1>{ida.viagem.cidadeOrigem} → {ida.viagem.cidadeDestino}</h1>
        <p>Escolha seu lugar tocando em um assento livre.{volta ? " Você pode reservar a ida, a volta ou as duas." : ""}</p></div></div>
      <div className="panel">
        {nadaDisponivel ? (
          <>
            <p className="aviso">{trechoIda.bloqueio}{trechoVolta?.bloqueio ? ` ${trechoVolta.bloqueio}` : ""}</p>
            <Link href="/paciente">Voltar ao início</Link>
          </>
        ) : (
          <FormReserva ida={trechoIda} volta={trechoVolta} acao={acaoReservar} destino="/paciente?reservado=1" souPaciente />
        )}
      </div>
    </Casca>
  );
}
