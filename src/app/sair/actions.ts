"use server";
import { redirect } from "next/navigation";
import { sair, usuarioAtual } from "@/lib/auth";

export async function acaoSair() {
  const u = await usuarioAtual();
  const slug = u?.papel === "paciente" ? u.secretaria?.slug : null;
  await sair();
  redirect(slug ? `/${slug}/entrar` : "/entrar");
}
