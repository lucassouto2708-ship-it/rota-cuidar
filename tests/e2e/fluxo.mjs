// Fluxo completo no navegador: admin → secretaria → gestor → paciente.
// Uso: node tests/e2e/fluxo.mjs http://localhost:3100 <pasta-para-prints>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3100";
const PRINTS = process.argv[3];
const id = Date.now().toString(36);
const browser = await chromium.launch();
const passos = [];
const ok = (m) => { passos.push(m); console.log("✓", m); };

async function novaAba(viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw new Error("Erro de JS na página: " + e.message); });
  return page;
}
const print = async (page, nome) => PRINTS && page.screenshot({ path: `${PRINTS}/${nome}.png`, fullPage: true });
const senhaDe = async (page) => (await page.locator(".senha-provisoria code, code.senha-inline").first().textContent()).trim();

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  return n.join("");
}

try {
  // ── ADMIN ──
  const admin = await novaAba();
  await admin.goto(BASE + "/");
  assert.match(admin.url(), /\/entrar$/); ok("sem login, a raiz manda para /entrar");
  await admin.fill("#email", "admin@demo.com");
  await admin.fill("#senha", "errada");
  await admin.click(".form button[type=submit]");
  await admin.getByText("Dados de acesso incorretos.").waitFor(); ok("senha errada mostra mensagem genérica");
  await admin.fill("#senha", "demo12345");
  await admin.click(".form button[type=submit]");
  await admin.waitForURL(/\/admin$/); ok("admin entra e cai em /admin");

  const slug = `cidade-${id}`;
  await admin.fill("#nome", `Secretaria de Saúde de Teste ${id}`);
  await admin.fill("#municipio", "Cidade Teste");
  await admin.fill("#uf", "sp");
  await admin.fill("#slug", slug);
  await admin.click(".form button[type=submit]");
  await admin.getByText(`/${slug}/entrar`).first().waitFor(); ok("admin cadastra secretaria");
  await admin.getByRole("link", { name: `Secretaria de Saúde de Teste ${id}` }).click();
  await admin.waitForURL(/\/admin\/secretarias\//);
  const emailGestor = `gestor-${id}@teste.com`;
  await admin.fill("#nome", "Gestora de Teste");
  await admin.fill("#email", emailGestor);
  await admin.click(".form button[type=submit]");
  await admin.locator(".senha-provisoria code").waitFor();
  const senhaGestor = await senhaDe(admin);
  ok(`admin cadastra gestor e recebe senha provisória (${senhaGestor.length} caracteres)`);
  await print(admin, "1-admin-secretaria");

  // ── GESTOR ──
  const gestor = await novaAba();
  await gestor.goto(BASE + "/entrar");
  await gestor.fill("#email", emailGestor.toUpperCase());
  await gestor.fill("#senha", senhaGestor);
  await gestor.click(".form button[type=submit]");
  await gestor.waitForURL(/\/conta\/senha$/); ok("gestor com senha provisória é obrigado a trocar");
  await gestor.goto(BASE + "/gestor/pacientes");
  await gestor.waitForURL(/\/conta\/senha$/); ok("…e não consegue pular a troca indo direto à página");
  await gestor.fill("#atual", senhaGestor);
  await gestor.fill("#nova", "gestora-nova-123");
  await gestor.fill("#confirmacao", "gestora-nova-123");
  await gestor.click(".form button[type=submit]");
  await gestor.waitForURL(/\/gestor$/); ok("gestor troca a senha e entra no painel");
  await gestor.goto(BASE + "/admin");
  await gestor.waitForURL(/\/gestor$/); ok("gestor que tenta abrir /admin volta para /gestor");

  await gestor.goto(BASE + "/gestor/pacientes");
  await gestor.fill("#nome", "Paciente Teste da Silva");
  await gestor.fill("#cpf", "123.456.789-00");
  await gestor.click(".form button[type=submit]");
  await gestor.getByText("CPF inválido.").waitFor(); ok("CPF inválido é recusado");
  const cpf = cpfValido();
  await gestor.fill("#cpf", cpf);
  await gestor.click(".form button[type=submit]");
  await gestor.locator(".senha-provisoria code").waitFor();
  const senhaPac = await senhaDe(gestor);
  await gestor.getByRole("cell", { name: "Paciente Teste da Silva" }).waitFor(); ok("gestor cadastra paciente e ele aparece na lista");
  await gestor.reload();
  await gestor.fill("input[name=busca]", "Silva");
  await gestor.press("input[name=busca]", "Enter");
  await gestor.waitForURL(/busca=Silva/);
  assert.equal(await gestor.locator("tbody tr").count(), 1); ok("busca de paciente funciona");
  await gestor.fill("#nome", "Duplicado");
  await gestor.fill("#cpf", cpf);
  await gestor.click(".form button[type=submit]");
  await gestor.getByText("Já existe um paciente com este CPF").waitFor(); ok("CPF duplicado na mesma secretaria é recusado");
  await print(gestor, "2-gestor-pacientes");

  // Isolamento: gestor de outra secretaria não vê este paciente
  const outro = await novaAba();
  await outro.goto(BASE + "/entrar");
  await outro.fill("#email", "gestor@vilaverde.demo");
  await outro.fill("#senha", "demo12345");
  await outro.click(".form button[type=submit]");
  await outro.waitForURL(/\/gestor$/);
  await outro.goto(BASE + "/gestor/pacientes");
  assert.equal(await outro.getByText("Paciente Teste da Silva").count(), 0); ok("gestor de outra secretaria NÃO vê o paciente");

  // ── PACIENTE ──
  const pac = await novaAba({ width: 390, height: 844 }); // celular
  await pac.goto(`${BASE}/vila-verde/entrar`);
  await pac.fill("#cpf", cpf);
  await pac.fill("#senha", senhaPac);
  await pac.click(".form button[type=submit]");
  await pac.getByText("Dados de acesso incorretos.").waitFor(); ok("paciente não entra pelo link de outra secretaria");
  await pac.goto(`${BASE}/${slug}/entrar`);
  await print(pac, "3-paciente-entrar-celular");
  await pac.fill("#cpf", cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"));
  await pac.fill("#senha", senhaPac);
  await pac.click(".form button[type=submit]");
  await pac.waitForURL(/\/conta\/senha$/); ok("paciente entra com CPF (com máscara) e é obrigado a trocar a senha");
  await pac.fill("#atual", senhaPac);
  await pac.fill("#nova", "paciente-123");
  await pac.fill("#confirmacao", "outra-coisa");
  await pac.click(".form button[type=submit]");
  await pac.getByText("A confirmação não confere").waitFor(); ok("confirmação de senha diferente é recusada");
  await pac.fill("#atual", senhaPac);
  await pac.fill("#nova", "paciente-123");
  await pac.fill("#confirmacao", "paciente-123");
  await pac.click(".form button[type=submit]");
  await pac.waitForURL(/\/paciente$/);
  await pac.getByRole("heading", { name: "Olá, Paciente!" }).waitFor(); ok("paciente troca a senha e vê a área dele");
  for (const rota of ["/gestor", "/gestor/pacientes", "/admin"]) {
    await pac.goto(BASE + rota);
    assert.match(pac.url(), /\/paciente$/);
  }
  ok("paciente não acessa /gestor nem /admin");
  await print(pac, "4-paciente-inicio-celular");

  // ── Suspensão pelo admin ──
  await admin.getByRole("button", { name: "Suspender acesso" }).click();
  await admin.getByText("Acesso suspenso").waitFor();
  await pac.goto(BASE + "/paciente");
  await pac.waitForURL(/\/entrar$/);
  await gestor.goto(BASE + "/gestor");
  await gestor.waitForURL(/\/entrar$/); ok("admin suspende a secretaria → gestor e paciente são desconectados na hora");
  await admin.getByRole("button", { name: "Reativar acesso" }).click();
  await admin.getByRole("button", { name: "Suspender acesso" }).waitFor(); ok("admin reativa a secretaria");

  // ── Sair ──
  await admin.getByRole("button", { name: "Sair" }).click();
  await admin.waitForURL(/\/entrar$/);
  await admin.goto(BASE + "/admin");
  await admin.waitForURL(/\/entrar$/); ok("sair encerra a sessão");

  console.log(`\nE2E OK: ${passos.length} verificações`);
} finally {
  await browser.close();
}
