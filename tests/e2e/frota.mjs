// Fluxo da frota no navegador (gestor). Uso: node tests/e2e/frota.mjs http://localhost:3100 [pasta-prints]
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PRINTS = process.argv[3];
const id = Date.now().toString(36).slice(-5).toUpperCase();
const browser = await chromium.launch();
let n = 0;
const ok = (m) => { n++; console.log("✓", m); };
const enviar = (p) => p.click(".form button[type=submit]");

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
  const p = await ctx.newPage();
  const errosJs = [];
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "J1" : undefined));

  await p.goto(BASE + "/entrar");
  await p.fill("#email", "gestor@vilaverde.demo");
  await p.fill("#senha", "demo12345");
  await enviar(p);
  await p.waitForURL(/\/gestor$/);
  await p.getByRole("link", { name: "Frota", exact: true }).click();
  await p.waitForURL(/\/gestor\/frota$/);
  await p.getByText("Van Renault Master").waitFor(); ok("gestor vê a frota da secretaria (dados do seed)");

  // cadastro com placa inválida
  await p.fill("#nome", `Van Teste ${id}`);
  await p.selectOption("#tipo", "van");
  await p.fill("#placa", "12-AB");
  await enviar(p);
  await p.getByText("Placa inválida").waitFor(); ok("placa inválida recusada (e o nome digitado continua no campo)");
  assert.equal(await p.inputValue("#nome"), `Van Teste ${id}`);
  const L = () => "ABCDEFGHJKLMNPRSTUVWXYZ"[Math.floor(Math.random() * 23)];
  const D = () => Math.floor(Math.random() * 10);
  await p.fill("#placa", `${L()}${L()}${L()}-${D()}${L()}${D()}${D()}`);
  await p.check("input[name=acessivel]");
  await enviar(p);
  await p.waitForURL(/\/gestor\/frota\/[0-9a-f-]+\?novo=1/);
  await p.getByText("Veículo cadastrado com o mapa padrão").waitFor();
  assert.equal(await p.locator(".grade-assentos .assento").count(), 15);
  await p.getByText("15", { exact: true }).first().waitFor(); ok("veículo criado já com o mapa padrão de van (15 vagas)");
  if (PRINTS) await p.screenshot({ path: `${PRINTS}/5-editor-van.png`, fullPage: true });

  // editar o mapa: cadeirante, equipe, apagar, adicionar, renomear
  const cel = (l, c) => p.locator(".grade-assentos > *").nth(l * 4 + c);
  await p.click(".ferramenta.f-cadeirante");
  await cel(1, 0).click();
  await p.click(".ferramenta.f-equipe");
  await cel(1, 1).click();
  await p.click(".ferramenta.f-apagar");
  await cel(4, 3).click();
  await p.getByText("Alterações não salvas").waitFor();
  assert.match(await p.locator(".resumo-assentos").textContent(), /13 vaga\(s\).*1 assento\(s\) da equipe/s);
  ok("editor: muda tipos e apaga assento, com contagem ao vivo (13 vagas + 1 equipe)");
  await p.click(".ferramenta.f-comum");
  await cel(0, 2).click(); // corredor da frente vira assento
  await p.click(".ferramenta.f-renomear");
  await cel(0, 2).click(); // prompt → "J1"
  assert.equal((await cel(0, 2).textContent()).trim(), "J1"); ok("editor: adiciona assento no corredor e renomeia");
  await cel(0, 0).click(); // motorista: não faz nada
  assert.equal((await cel(0, 0).getAttribute("title")), "Motorista");

  await p.getByRole("button", { name: "Salvar mapa" }).click();
  await p.getByText("Mapa salvo: 14 vaga(s) para passageiros e 1 da equipe.").waitFor();
  await p.reload();
  assert.equal(await p.locator(".grade-assentos .t-cadeirante").count(), 1);
  assert.equal(await p.locator(".grade-assentos .t-equipe").count(), 1);
  assert.equal((await cel(0, 2).textContent()).trim(), "J1"); ok("mapa salvo e preservado após recarregar a página");

  // erro: renomear duplicado bloqueia salvar
  await p.click(".ferramenta.f-renomear");
  p.removeAllListeners("dialog");
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "J1" : undefined));
  await cel(0, 1).click();
  await p.getByText('O assento "J1" aparece repetido.').waitFor();
  assert.equal(await p.getByRole("button", { name: "Salvar mapa" }).isDisabled(), true); ok("nome repetido mostra erro e bloqueia o botão salvar");
  await p.getByRole("button", { name: "Desfazer alterações" }).click();
  assert.equal(await p.getByText("aparece repetido").count(), 0); ok("desfazer volta ao último mapa salvo");

  // redimensionar
  await p.getByRole("button", { name: "Adicionar fileira" }).click();
  assert.equal(await p.locator(".grade-assentos > *").count(), 7 * 4); ok("adicionar fileira aumenta a grade");
  await p.getByRole("button", { name: "Desfazer alterações" }).click();

  // dados do veículo
  await p.fill("#nome", `Van Teste ${id} editada`);
  await p.click(".form button[type=submit]");
  await p.getByText("Dados do veículo salvos.").waitFor(); ok("edita os dados do veículo");

  // inativar / reativar
  await p.getByRole("button", { name: "Inativar veículo" }).click();
  await p.getByRole("button", { name: "Reativar veículo" }).waitFor(); ok("inativa o veículo (com confirmação)");
  await p.getByRole("button", { name: "Reativar veículo" }).click();
  await p.getByRole("button", { name: "Inativar veículo" }).waitFor(); ok("reativa o veículo");

  // motoristas
  await p.getByRole("link", { name: "Motoristas" }).click();
  await p.waitForURL(/motoristas$/);
  await p.fill("#nome", `Motorista ${id}`);
  await p.fill("#cnh", "123");
  await enviar(p);
  await p.getByText("A CNH deve ter 11 dígitos.").waitFor(); ok("CNH inválida recusada");
  await p.fill("#cnh", String(Date.now()).slice(-11));
  await enviar(p);
  await p.getByRole("cell", { name: `Motorista ${id}` }).waitFor(); ok("cadastra motorista");
  const linha = p.locator("tr", { hasText: `Motorista ${id}` });
  await linha.getByRole("button", { name: "Inativar" }).click();
  await linha.getByRole("button", { name: "Reativar" }).waitFor(); ok("inativa motorista");

  // isolamento: gestor de outra secretaria não abre o veículo
  const urlVeiculo = (await p.goto(BASE + "/gestor/frota"), await p.locator(".vehicle-card", { hasText: `Van Teste ${id}` }).getAttribute("href"));
  const outro = await (await browser.newContext()).newPage();
  await outro.goto(BASE + "/entrar");
  await outro.fill("#email", "gestor@serraalta.demo");
  await outro.fill("#senha", "demo12345");
  await enviar(outro);
  await outro.waitForURL(/\/gestor$/);
  const resp = await outro.goto(BASE + urlVeiculo);
  assert.equal(resp.status(), 404);
  await outro.goto(BASE + "/gestor/frota");
  assert.equal(await outro.getByText(`Van Teste ${id}`).count(), 0); ok("gestor de outra secretaria recebe 404 no veículo e não o vê na frota");

  // celular
  const cel2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await cel2.goto(BASE + "/entrar");
  await cel2.fill("#email", "gestor@vilaverde.demo");
  await cel2.fill("#senha", "demo12345");
  await enviar(cel2);
  await cel2.waitForURL(/\/gestor$/);
  await cel2.goto(BASE + urlVeiculo);
  const largura = await cel2.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 390, `página mais larga que a tela: ${largura}px`); ok("editor cabe na tela do celular, sem rolagem lateral");
  if (PRINTS) await cel2.screenshot({ path: `${PRINTS}/6-editor-celular.png`, fullPage: true });

  assert.deepEqual(errosJs, []); ok("nenhum erro de JavaScript nas páginas");
  console.log(`\nE2E FROTA OK: ${n} verificações`);
} finally {
  await browser.close();
}
