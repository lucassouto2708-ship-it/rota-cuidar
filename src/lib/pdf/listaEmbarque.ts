/**
 * PDF da lista de embarque (A4 deitado), uma seção por trecho (ida e volta),
 * com caixa de presença e espaço para assinatura do passageiro.
 */
import PDFDocument from "pdfkit";
import { formatarCpf } from "../cpf";
import { NOME_TIPO_VEICULO } from "../layouts";
import type { listaEmbarque } from "../servicos/reservas";
import { dataBr, horaBr } from "../servicos/viagens";

type Lista = NonNullable<Awaited<ReturnType<typeof listaEmbarque>>>;

const COR = { tinta: "#172d2a", suave: "#6b7a76", linha: "#cfd8d5", fundo: "#eef5f2", verde: "#167c68" };
const M = 32; // margem

type Coluna = { titulo: string; largura: number; valor: (p: Lista["passageiros"][number], l: Lista) => string; negrito?: boolean };

const placaFmt = (p: string | null) => (p && p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : (p ?? ""));
const doc = (d: string | null) => (d && /^\d{11}$/.test(d) ? formatarCpf(d) : (d ?? "-"));

function colunas(l: Lista): Coluna[] {
  const ida = l.viagem.sentido === "ida";
  const cols: Coluna[] = [
    { titulo: "Assento", largura: 52, valor: (p) => p.assento, negrito: true },
    { titulo: "Passageiro", largura: 160, valor: (p) => (p.tipo === "acompanhante" ? `${p.nome}\nAcompanhante de ${p.acompanhanteDe}` : p.nome), negrito: true },
    { titulo: "Documento", largura: 86, valor: (p) => doc(p.documento) + (p.cns ? `\nSUS ${p.cns}` : "") },
    { titulo: "Telefone", largura: 80, valor: (p) => p.telefone ?? "-" },
    { titulo: "Ponto de embarque", largura: 100, valor: (p) => p.pontoEmbarque ?? "-" },
    {
      titulo: ida ? "Destino / horário" : "Local de retorno",
      largura: 115,
      valor: (p) => [p.localDestino ?? "-", p.horarioCompromisso ? `às ${horaBr(p.horarioCompromisso)}` : ""].filter(Boolean).join("\n"),
    },
  ];
  if (l.viagem.viagemParId) cols.push({ titulo: ida ? "Volta?" : "Foi na ida?", largura: 44, valor: (p) => (p.temOutroTrecho ? "Sim" : "Não") });
  cols.push({ titulo: "Embarcou", largura: 60, valor: () => "" });
  return cols;
}

function secao(pdf: PDFKit.PDFDocument, l: Lista, geradoEm: string) {
  const largura = pdf.page.width - 2 * M;
  const cols = colunas(l);
  const assinatura = largura - cols.reduce((n, c) => n + c.largura, 0);
  const sentido = l.viagem.sentido === "ida" ? "IDA" : "VOLTA";

  // ── Cabeçalho ──
  pdf.fillColor(COR.suave).font("Helvetica").fontSize(9).text(l.secretaria.nome.toUpperCase(), M, M);
  pdf.fillColor(COR.tinta).font("Helvetica-Bold").fontSize(18).text(`Lista de embarque - ${sentido}`, M, M + 13);
  pdf.font("Helvetica").fontSize(10).fillColor(COR.tinta);
  const status = l.viagem.status === "cancelada" ? "   [VIAGEM CANCELADA]" : "";
  pdf.text(
    `${dataBr(l.viagem.data)}  ·  saída ${horaBr(l.viagem.saida)}  ·  ${l.viagem.cidadeOrigem}  >  ${l.viagem.cidadeDestino}${status}`,
    M, M + 36,
  );
  pdf.fillColor(COR.suave).text(
    `Veículo: ${l.veiculo.nome} (${NOME_TIPO_VEICULO[l.veiculo.tipo]}${l.veiculo.placa ? `, placa ${placaFmt(l.veiculo.placa)}` : ""})   ·   Motorista: ${l.motorista?.nome ?? "não definido"}   ·   Passageiros: ${l.resumo.total}`,
    M, M + 51,
  );
  if (l.viagem.observacoes) pdf.text(`Obs.: ${l.viagem.observacoes}`, M, M + 65, { width: largura });

  let y = M + (l.viagem.observacoes ? 86 : 74);

  const cabecalhoTabela = () => {
    pdf.rect(M, y, largura, 20).fill(COR.fundo);
    let x = M;
    pdf.fillColor(COR.tinta).font("Helvetica-Bold").fontSize(8);
    for (const c of cols) {
      pdf.text(c.titulo.toUpperCase(), x + 4, y + 6, { width: c.largura - 8 });
      x += c.largura;
    }
    pdf.text("ASSINATURA", x + 4, y + 6, { width: assinatura - 8 });
    y += 20;
  };
  cabecalhoTabela();

  if (!l.passageiros.length) {
    pdf.font("Helvetica").fontSize(10).fillColor(COR.suave).text("Nenhum passageiro com reserva nesta viagem.", M, y + 12);
    y += 34;
  }

  for (const p of l.passageiros) {
    pdf.font("Helvetica").fontSize(9);
    const alturas = cols.map((c) => pdf.heightOfString(c.valor(p, l) || " ", { width: c.largura - 8 }));
    const h = Math.max(26, ...alturas.map((a) => a + 12));
    if (y + h > pdf.page.height - M - 60) {
      pdf.addPage();
      y = M;
      cabecalhoTabela();
    }
    let x = M;
    for (const c of cols) {
      const texto = c.valor(p, l);
      const [primeira, ...resto] = texto.split("\n");
      pdf.fillColor(COR.tinta).font(c.negrito ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(primeira, x + 4, y + 6, { width: c.largura - 8 });
      if (resto.length) pdf.fillColor(COR.suave).font("Helvetica").fontSize(8).text(resto.join("\n"), x + 4, pdf.y + 1, { width: c.largura - 8 });
      x += c.largura;
    }
    // caixa de presença (na coluna "Embarcou")
    const caixaX = x - cols[cols.length - 1].largura + 16;
    pdf.lineWidth(1).strokeColor(COR.tinta).rect(caixaX, y + 6, 12, 12).stroke();
    if (p.embarque === "presente") pdf.font("Helvetica-Bold").fontSize(11).fillColor(COR.verde).text("X", caixaX + 2.5, y + 6.5);
    if (p.embarque === "faltou") pdf.font("Helvetica-Bold").fontSize(7).fillColor("#bb4c48").text("FALTOU", caixaX - 6, y + 20);
    // linha de assinatura
    pdf.strokeColor(COR.linha).moveTo(x + 6, y + h - 7).lineTo(x + assinatura - 6, y + h - 7).stroke();
    pdf.strokeColor(COR.linha).lineWidth(0.5).moveTo(M, y + h).lineTo(M + largura, y + h).stroke();
    y += h;
  }

  // ── Rodapé da seção ──
  if (y > pdf.page.height - M - 60) {
    pdf.addPage();
    y = M;
  }
  y += 16;
  pdf.font("Helvetica").fontSize(9).fillColor(COR.tinta);
  pdf.text(`Total: ${l.resumo.total}     Presentes: ______     Faltas: ______`, M, y, { width: 400, lineBreak: false });
  pdf.text("_____________________________________", M + largura - 230, y - 2, { width: 230, align: "center" });
  pdf.fillColor(COR.suave).fontSize(8).text("Assinatura do motorista", M + largura - 230, y + 10, { width: 230, align: "center" });
  pdf.text(`Gerado em ${geradoEm} pelo Rota Cuidar`, M, y + 14, { width: 400, lineBreak: false });
}

/** Gera o PDF de uma ou mais listas (ex.: ida + volta). */
export function gerarPdfListas(listas: Lista[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: M,
      bufferPages: true,
      info: { Title: "Lista de embarque", Author: "Rota Cuidar" },
    });
    const partes: Buffer[] = [];
    pdf.on("data", (b: Buffer) => partes.push(b));
    pdf.on("end", () => resolve(Buffer.concat(partes)));
    pdf.on("error", reject);
    const geradoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
    listas.forEach((l, i) => {
      if (i > 0) pdf.addPage();
      secao(pdf, l, geradoEm);
    });
    // numeração de páginas
    const { start, count } = pdf.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      pdf.switchToPage(i);
      pdf.page.margins.bottom = 0; // escrever no rodapé sem o pdfkit criar página nova
      pdf.font("Helvetica").fontSize(8).fillColor(COR.suave)
        .text(`Página ${i + 1} de ${count}`, M, pdf.page.height - M + 8, { width: pdf.page.width - 2 * M, align: "right", lineBreak: false });
    }
    pdf.end();
  });
}
