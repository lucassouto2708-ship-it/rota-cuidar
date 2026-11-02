import { NextResponse } from "next/server";
import { comoAtor, usuarioAtual } from "@/lib/auth";
import { gerarPdfListas } from "@/lib/pdf/listaEmbarque";
import { listaEmbarque } from "@/lib/servicos/reservas";

export const dynamic = "force-dynamic";

/** PDF da lista de embarque: ida + volta (ou só este trecho com ?so=1). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || u.papel !== "gestor" || u.trocarSenha) return new NextResponse("Não autorizado", { status: 401 });
  const ator = comoAtor(u);
  const { id } = await params;
  const esta = await listaEmbarque(ator, id);
  if (!esta) return new NextResponse("Viagem não encontrada", { status: 404 });
  const so = new URL(req.url).searchParams.get("so") === "1";
  const par = !so && esta.viagem.viagemParId ? await listaEmbarque(ator, esta.viagem.viagemParId) : null;
  const listas = par ? (esta.viagem.sentido === "ida" ? [esta, par] : [par, esta]) : [esta];
  const pdf = await gerarPdfListas(listas);
  const v = listas[0].viagem;
  const nome = `lista-embarque-${v.data}-${v.saida.slice(0, 5).replace(":", "h")}-${v.cidadeDestino}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
