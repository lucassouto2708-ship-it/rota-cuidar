import Link from "next/link";
import { Casca } from "@/components/Casca";
import { exigirComSenhaDefinitiva } from "@/lib/auth";
import { NOME_TIPO_VEICULO } from "@/lib/layouts";
import { listarMotoristas, listarVeiculos } from "@/lib/servicos/frota";
import { hojeBr } from "@/lib/servicos/viagens";
import { acaoCriarViagens } from "../actions";
import { FormNovaViagem } from "./FormNovaViagem";

export default async function NovaViagem() {
  const { usuario, ator } = await exigirComSenhaDefinitiva("gestor");
  const [veiculos, motoristas] = await Promise.all([listarVeiculos(ator, { somenteAtivos: true }), listarMotoristas(ator, { somenteAtivos: true })]);
  return (
    <Casca usuario={usuario}>
      <div className="page-head"><div><div className="eyebrow"><Link href="/gestor/viagens">VIAGENS</Link> / NOVA</div><h1>Nova viagem</h1><p>Crie a ida e a volta juntas. Para viagens fixas, use a repetição semanal.</p></div></div>
      <div className="panel estreito-largo">
        {veiculos.length === 0 ? <p className="aviso">Cadastre um veículo na <Link href="/gestor/frota">Frota</Link> antes de criar viagens.</p> : (
          <FormNovaViagem
            veiculos={veiculos.map((v) => ({ id: v.id, nome: v.nome, detalhe: `${NOME_TIPO_VEICULO[v.tipo]}, ${v.vagas} vagas` }))}
            motoristas={motoristas.map((m) => ({ id: m.id, nome: m.nome }))}
            hoje={hojeBr()} municipio={usuario.secretaria!.municipio} acao={acaoCriarViagens}
          />
        )}
      </div>
    </Casca>
  );
}
