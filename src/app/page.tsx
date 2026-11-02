import { redirect } from "next/navigation";
import { HOME_DO_PAPEL, usuarioAtual } from "@/lib/auth";

export default async function Inicio() {
  const u = await usuarioAtual();
  redirect(u ? HOME_DO_PAPEL[u.papel] : "/entrar");
}
