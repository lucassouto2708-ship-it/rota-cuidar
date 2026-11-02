import { NextResponse } from "next/server";
import { pool } from "@/db";
import { diagnosticarErroBanco } from "@/lib/diagnostico";

export const dynamic = "force-dynamic";

/** Diagnóstico rápido: o site consegue falar com o banco? (não mostra dados nem senha) */
export async function GET() {
  const inicio = Date.now();
  try {
    const { rows } = await pool.query("select exists (select 1 from usuarios where papel = 'admin') as tem_admin");
    return NextResponse.json(
      { ok: true, banco: "conectado", admin_cadastrado: rows[0]?.tem_admin === true, tempo_ms: Date.now() - inicio },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[saude] falha no banco:", e);
    return NextResponse.json(diagnosticarErroBanco(e), { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
