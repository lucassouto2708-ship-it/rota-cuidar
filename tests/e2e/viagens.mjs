// Viagens, reservas, lista de embarque e PDF no navegador.
// Uso: node tests/e2e/viagens.mjs http://localhost:3100 [pasta-prints]   (requer o seed)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PRINTS = process.argv[3];
const browser = await chromium.launch();
let n = 0;
const ok = (m) => { n++; console.log("✓", m); };
const errosJs = [];
const enviarForm = (p, form = ".form") => p.locator(`${form} button[type=submit]`).first().click();

// data/hora de Brasília
const agoraBr = new Date(Date.now() - 3 * 3600e3);
const hojeIso = agoraBr.toISOString().slice(0, 10);
const tardeDemais = agoraBr.getUTCHours() >= 21;
const diaTeste = tardeDemais ? new Date(Date.now() + 21 * 3600e3).toISOString().slice(0, 10) : hojeIso;
const amanha = new Date(agoraBr.getTime() + 864e5).toISOString().slice(0, 10);
const destino = `Sorocaba ${Date.now().toString(36).slice(-4)}`;

async function entrar(p, url, campos) {
  await p.goto(BASE + url);
  for (const [k, v] of Object.entries(campos)) await p.fill(k, v);
  await enviarForm(p);
}
async function aba(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.on("dialog", (d) => d.accept());
  return p;
}

try {
  // ── GESTOR cria viagem ──
  const g = await aba();
  await entrar(g, "/entrar", { "#email": "gestor@vilaverde.demo", "#senha": "demo12345" });
  await g.waitForURL(/\/gestor$/);
  // veículo e motorista exclusivos desta execução (o teste pode ser repetido)
  const sufixo = destino.slice(-4);
  const carro = `Carro E2E ${sufixo}`;
  const motorista = `Motorista E2E ${sufixo}`;
  await g.goto(BASE + "/gestor/frota");
  await g.fill("#nome", carro);
  await g.selectOption("#tipo", "carro");
  await enviarForm(g);
  await g.waitForURL(/\/gestor\/frota\/[0-9a-f-]+/);
  await g.goto(BASE + "/gestor/motoristas");
  await g.fill("#nome", motorista);
  await enviarForm(g);
  await g.getByRole("cell", { name: motorista }).waitFor();
  await g.goto(BASE + "/gestor");
  await g.getByRole("link", { name: "Viagens", exact: true }).click();
  await g.waitForURL(/\/gestor\/viagens$/);
  await g.getByText("Vila Verde → Campinas").first().waitFor(); ok("lista de viagens mostra as viagens do seed");
  await g.getByRole("link", { name: "＋ Nova viagem" }).click();
  await g.waitForURL(/\/viagens\/nova$/);
  await g.fill("#cidadeDestino", destino);
  await g.fill("#data", diaTeste);
  await g.fill("#saida", "22:00");
  await g.selectOption("#veiculoId", { label: `${carro} · Carro, 4 vagas` });
  await g.selectOption("#motoristaId", { label: motorista });
  await g.fill("#voltaSaida", "21:30");
  await enviarForm(g);
  await g.getByText("A volta precisa sair depois da ida.").waitFor(); ok("volta antes da ida é recusada, sem perder o que foi digitado");
  assert.equal(await g.inputValue("#cidadeDestino"), destino);
  await g.fill("#voltaSaida", "22:30");
  await enviarForm(g);
  await g.getByText("pelo menos 60 minutos depois da ida").waitFor(); ok("volta 30 min depois com o mesmo carro: mensagem clara");
  await g.fill("#voltaSaida", "23:30");
  await enviarForm(g);
  await g.waitForURL(/\/gestor\/viagens\/[0-9a-f-]+\?nova=1/);
  const urlIda = new URL(g.url()).pathname;
  await g.getByText("Viagem criada com a volta").waitFor(); ok("gestor cria ida + volta");

  // conflito de veículo
  await g.goto(BASE + "/gestor/viagens/nova");
  await g.fill("#cidadeDestino", "Outra Cidade");
  await g.fill("#data", diaTeste);
  await g.fill("#saida", "22:20");
  await g.selectOption("#veiculoId", { label: `${carro} · Carro, 4 vagas` });
  await g.uncheck("input[name=comVolta]");
  await enviarForm(g);
  await g.getByText("Este veículo já tem viagem").waitFor(); ok("mesmo veículo com menos de 60 min de diferença é recusado");

  // paciente extra para o gestor reservar
  await g.goto(BASE + "/gestor/pacientes");
  const novoCpf = () => { const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, x, i) => a + x * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; d.push(dv(d)); d.push(dv(d)); return d.join(""); };
  const cpfAnt = novoCpf();
  const cpfPac = novoCpf();
  const nomePac = `Helena Teste ${destino.slice(-4)}`;
  await g.fill("#nome", nomePac);
  await g.fill("#cpf", cpfPac);
  await enviarForm(g);
  await g.locator(".senha-provisoria code").waitFor();
  const senhaPac = (await g.locator(".senha-provisoria code").textContent()).trim();
  await g.reload();
  const nomeAnt = `Antônio Teste ${destino.slice(-4)}`;
  await g.fill("#nome", nomeAnt);
  await g.fill("#cpf", cpfAnt);
  await g.fill("#telefone", "(19) 97777-0000");
  await enviarForm(g);
  await g.locator(".senha-provisoria").waitFor();

  // ── PACIENTE reserva pelo celular ──
  const maria = await aba({ width: 390, height: 844 });
  await entrar(maria, "/vila-verde/entrar", { "#cpf": "529.982.247-25", "#senha": "demo12345" });
  await maria.waitForURL(/\/paciente$/);
  await maria.getByText("Vila Verde → Campinas").first().waitFor();
  await maria.getByText("Pedro Oliveira").first().waitFor(); ok("paciente vê as reservas feitas pela secretaria (com acompanhante)");

  const pac = await aba({ width: 390, height: 844 });
  await entrar(pac, "/vila-verde/entrar", { "#cpf": cpfPac, "#senha": senhaPac });
  await pac.waitForURL(/\/conta\/senha$/);
  await pac.fill("#atual", senhaPac);
  await pac.fill("#nova", "helena-12345");
  await pac.fill("#confirmacao", "helena-12345");
  await enviarForm(pac);
  await pac.waitForURL(/\/paciente$/);
  const cartao = pac.locator(".disponivel", { hasText: destino });
  await cartao.getByRole("link", { name: "Reservar" }).click();
  await pac.waitForURL(/\/paciente\/viagens\//);
  await pac.check("text=Vai com acompanhante");
  await pac.fill("#acompanhanteNome", "Luiza Oliveira");
  const mapas = pac.locator(".trecho");
  await mapas.nth(0).locator(".e-livre").first().click(); // paciente
  await mapas.nth(0).locator(".e-livre").first().click(); // acompanhante (próximo livre)
  await enviarForm(pac);
  await pac.getByText("Escolha o assento seu da volta.").waitFor(); ok("avisa quando falta escolher o assento da volta");
  await mapas.nth(1).locator(".e-livre").nth(1).click();
  await mapas.nth(1).locator(".e-livre").nth(1).click();
  assert.equal(await mapas.nth(1).locator(".sel").count(), 2);
  await pac.fill("#localDestino", "Hospital Regional");
  await pac.fill("#horarioCompromisso", "08:30");
  if (PRINTS) await pac.screenshot({ path: `${PRINTS}/7-paciente-reserva.png`, fullPage: true });
  const largura = await pac.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 390, `rolagem lateral: ${largura}px`); ok("tela de reserva cabe no celular");
  await enviarForm(pac);
  await pac.waitForURL(/\/paciente\?reservado=1/);
  await pac.getByText("Reserva confirmada!").waitFor();
  const meus = pac.locator(".cartao-reserva", { hasText: destino.split(" ")[0] });
  assert.equal(await pac.locator(".cartao-reserva", { hasText: `Vila Verde → ${destino}` }).count(), 1);
  assert.equal(await pac.locator(".cartao-reserva", { hasText: `${destino} → Vila Verde` }).count(), 1);
  await pac.locator(".cartao-reserva", { hasText: `Vila Verde → ${destino}` }).getByText("Luiza Oliveira").waitFor();
  ok("paciente reserva ida + volta com acompanhante e vê os cartões");
  if (PRINTS) await pac.screenshot({ path: `${PRINTS}/8-paciente-inicio.png`, fullPage: true });
  await pac.locator(".disponivel", { hasText: destino }).getByText("Reservado").waitFor(); ok("viagem aparece como 'Reservado' na lista de disponíveis");

  // ── GESTOR vê ocupação e reserva para outro paciente ──
  await g.goto(BASE + urlIda);
  await g.getByText("Ocupação · 2 de 4 vagas").waitFor();
  await g.getByRole("cell", { name: `Luiza Oliveira (acomp. de ${nomePac})` }).waitFor(); ok("gestor vê nomes no mapa/lista (paciente e acompanhante)");
  const valorAnt = await g.locator("#pacienteId option", { hasText: nomeAnt }).getAttribute("value");
  await g.selectOption("#pacienteId", valorAnt);
  const trechosG = g.locator(".trecho");
  await trechosG.nth(1).locator("input[type=checkbox]").uncheck(); // só ida
  await trechosG.nth(0).locator(".e-livre").first().click();
  await enviarForm(g, ".form-reserva");
  await g.getByText("Ocupação · 3 de 4 vagas").waitFor(); ok("gestor reserva só a ida para outro paciente");
  if (PRINTS) await g.screenshot({ path: `${PRINTS}/9-gestor-viagem.png`, fullPage: true });

  // ── Lista de embarque ──
  await g.getByRole("link", { name: "Lista de embarque" }).click();
  await g.waitForURL(/\/lista$/);
  const linhaAnt = g.locator("tr", { hasText: nomeAnt });
  await linhaAnt.getByText("Não").waitFor(); ok("lista mostra que o outro paciente NÃO tem volta");
  if (!tardeDemais) {
    await linhaAnt.getByRole("button", { name: "Faltou" }).click();
    await linhaAnt.getByText("Faltou", { exact: true }).waitFor();
    for (const nome of [nomePac, "Luiza Oliveira"]) {
      const l = g.locator("tr", { hasText: nome }).first();
      await l.getByRole("button", { name: "✓ Embarcou" }).click();
      await l.getByText("Embarcou", { exact: true }).waitFor();
    }
    assert.equal((await g.locator(".stat-num.ok-num").textContent()).trim(), "2");
    assert.equal((await g.locator(".stat-num.falta-num").textContent()).trim(), "1"); ok("marca embarque/falta e o resumo atualiza (2 embarcaram, 1 faltou)");
    if (PRINTS) await g.screenshot({ path: `${PRINTS}/10-lista-embarque.png`, fullPage: true });
    await g.getByRole("button", { name: "Concluir viagem" }).click();
    await g.getByText("Concluída").first().waitFor(); ok("conclui a viagem após conferir todos");
  }

  // ── PDF ──
  const resp = await g.request.get(BASE + urlIda + "/pdf");
  assert.equal(resp.status(), 200);
  assert.equal(resp.headers()["content-type"], "application/pdf");
  const dir = mkdtempSync(join(tmpdir(), "e2e-pdf-"));
  const arq = join(PRINTS ?? dir, "lista-embarque.pdf");
  writeFileSync(arq, await resp.body());
  const texto = execFileSync("pdftotext", ["-layout", arq, "-"]).toString();
  for (const t of ["Lista de embarque - IDA", "Lista de embarque - VOLTA", nomePac, "Luiza Oliveira", nomeAnt, motorista, "Hospital Regional"]) assert.ok(texto.includes(t), `PDF sem "${t}"`);
  ok("PDF da ida + volta baixa com os passageiros, motorista e destino");

  // ── Paciente cancela a volta ──
  await pac.goto(BASE + "/paciente");
  const cartaoVolta = pac.locator(".cartao-reserva", { hasText: `${destino} → Vila Verde` });
  await cartaoVolta.getByRole("button", { name: "Cancelar reserva" }).click();
  await pac.locator(".cartao-reserva", { hasText: `${destino} → Vila Verde` }).waitFor({ state: "detached" });
  ok("paciente cancela a própria reserva da volta (com o acompanhante)");
  const textoVolta = execFileSync("pdftotext", ["-layout", "-", "-"], { input: await (await g.request.get(BASE + urlIda + "/pdf")).body() }).toString();
  assert.ok(!textoVolta.split("Lista de embarque - VOLTA")[1].includes("Luiza Oliveira")); ok("após cancelar, a volta no PDF não tem mais o acompanhante");

  // ── Gestor cancela uma viagem ──
  await g.goto(BASE + "/gestor/viagens/nova");
  await g.fill("#cidadeDestino", "Itu");
  await g.fill("#data", amanha);
  await g.fill("#saida", "10:00");
  await g.selectOption("#veiculoId", { label: `${carro} · Carro, 4 vagas` });
  await g.uncheck("input[name=comVolta]");
  await enviarForm(g);
  await g.waitForURL(/\?nova=1/);
  await g.getByText("Cancelar esta viagem").click();
  await g.fill("#motivo", "Veículo em manutenção");
  await g.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await g.getByText("Esta viagem foi cancelada").waitFor();
  await g.getByText("Cancelada: Veículo em manutenção").waitFor();
  assert.equal(await g.getByText("Reservar para um paciente").count(), 0); ok("gestor cancela viagem com motivo");

  // ── Isolamento ──
  const outro = await aba();
  await entrar(outro, "/entrar", { "#email": "gestor@serraalta.demo", "#senha": "demo12345" });
  await outro.waitForURL(/\/gestor$/);
  assert.equal((await outro.goto(BASE + urlIda)).status(), 404);
  assert.equal((await outro.request.get(BASE + urlIda + "/pdf")).status(), 404);
  assert.equal((await outro.goto(BASE + urlIda + "/lista")).status(), 404); ok("gestor de outra secretaria: 404 na viagem, na lista e no PDF");
  const jose = await aba({ width: 390, height: 844 });
  await entrar(jose, "/serra-alta/entrar", { "#cpf": "111.444.777-35", "#senha": "demo12345" });
  await jose.waitForURL(/\/paciente$/);
  assert.equal(await jose.getByText(destino).count(), 0);
  const idIda = urlIda.split("/").pop();
  assert.equal((await jose.goto(`${BASE}/paciente/viagens/${idIda}`)).status(), 404); ok("paciente de outra secretaria não vê nem abre a viagem");
  assert.equal((await pac.request.get(BASE + urlIda + "/pdf")).status(), 401); ok("paciente não baixa PDF de lista (401)");

  assert.deepEqual(errosJs, []); ok("nenhum erro de JavaScript");
  console.log(`\nE2E VIAGENS OK: ${n} verificações${tardeDemais ? " (presença pulada: depois das 22h)" : ""}`);
} finally {
  await browser.close();
}
