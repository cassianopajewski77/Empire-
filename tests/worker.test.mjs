// Testes do servidor (src/worker.js) com o Mercado Pago simulado.
// Rodar: node --test tests/
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { calcularCobranca } from "../src/worker.js";

const RAIZ = new URL("../public/", import.meta.url);
const catalogoReal = JSON.parse(await readFile(new URL("data/catalogo.json", RAIZ), "utf8"));
const lojaReal = JSON.parse(await readFile(new URL("data/loja.json", RAIZ), "utf8"));

function catalogoComPrecos() {
  const c = structuredClone(catalogoReal);
  const precos = { p: 30, m: 40, g: 120, classico: 80, divertido: 85 };
  for (const p of c.produtos) for (const m of p.modelos) m.preco = precos[m.id];
  return c;
}

function ambiente(catalogo, extra = {}) {
  return {
    MP_ACCESS_TOKEN: "TEST-token",
    ASSETS: {
      async fetch(req) {
        const caminho = new URL(req.url).pathname;
        if (caminho === "/data/catalogo.json") return Response.json(catalogo);
        if (caminho === "/data/loja.json") return Response.json(lojaReal);
        return new Response("arquivo " + caminho);
      },
    },
    ...extra,
  };
}

const pedido = {
  codigo: "EMP-ABC234",
  cliente: { nome: "Cliente Teste", email: "cliente@example.com" },
  itens: [{ produtoId: "mousepad", modeloId: "m", quantidade: 2, precoUnitario: 0.01 }, { produtoId: "tapete-pet", modeloId: "classico", quantidade: 1 }],
};

let chamadas;
const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), opcoes });
    if (opcoes.method === "POST") {
      return Response.json({
        id: 123456, status: "pending", transaction_amount: JSON.parse(opcoes.body).transaction_amount,
        point_of_interaction: { transaction_data: { qr_code: "00020126PIXCOPIAECOLA", qr_code_base64: "iVBORw0KGgo=" } },
      }, { status: 201 });
    }
    return Response.json({ id: 123456, status: "approved", transaction_amount: 160, external_reference: "EMP-ABC234", date_approved: "2026-10-25T10:00:00.000-03:00" });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const post = (env, corpo) => worker.fetch(new Request("https://loja.test/api/pix", { method: "POST", body: JSON.stringify(corpo) }), env);

test("calcula o total com os preços do catálogo, ignorando preços enviados pelo navegador", () => {
  const r = calcularCobranca(pedido, catalogoComPrecos(), lojaReal);
  assert.equal(r.valor, 40 * 2 + 80);
});

test("recusa cobrar quando algum preço ainda não foi definido", async () => {
  const semPreco = catalogoComPrecos();
  semPreco.produtos.find(p => p.id === "tapete-pet").modelos[0].preco = null;
  const resp = await post(ambiente(semPreco), pedido);
  assert.equal(resp.status, 409);
  assert.equal((await resp.json()).codigoErro, "preco_indefinido");
  assert.equal(chamadas.length, 0);
});

test("valida código, e-mail, produto e quantidade", () => {
  const c = catalogoComPrecos();
  assert.ok(calcularCobranca({ ...pedido, codigo: "X" }, c, lojaReal).erro);
  assert.ok(calcularCobranca({ ...pedido, cliente: { email: "sem-arroba" } }, c, lojaReal).erro);
  assert.ok(calcularCobranca({ ...pedido, itens: [{ produtoId: "mousepad", modeloId: "zz", quantidade: 1 }] }, c, lojaReal).erro);
  assert.ok(calcularCobranca({ ...pedido, itens: [{ produtoId: "mousepad", modeloId: "m", quantidade: 0 }] }, c, lojaReal).erro);
  assert.ok(calcularCobranca({ ...pedido, itens: [{ produtoId: "mousepad", modeloId: "m", quantidade: 2.5 }] }, c, lojaReal).erro);
  assert.ok(calcularCobranca({ ...pedido, itens: [] }, c, lojaReal).erro);
});

test("sem token configurado, avisa que o pagamento não está configurado", async () => {
  const resp = await post(ambiente(catalogoComPrecos(), { MP_ACCESS_TOKEN: undefined }), pedido);
  assert.equal(resp.status, 503);
  assert.equal((await resp.json()).codigoErro, "nao_configurado");
});

test("cria o Pix no Mercado Pago com valor do servidor e chave de idempotência", async () => {
  const resp = await post(ambiente(catalogoComPrecos()), { ...pedido, tentativa: 1 });
  assert.equal(resp.status, 200);
  const r = await resp.json();
  assert.deepEqual(r, { id: "123456", status: "pending", valor: 160, copiaECola: "00020126PIXCOPIAECOLA", qrCodeBase64: "iVBORw0KGgo=", expiraEm: null });
  const [chamada] = chamadas;
  assert.equal(chamada.url, "https://api.mercadopago.com/v1/payments");
  assert.equal(chamada.opcoes.headers.Authorization, "Bearer TEST-token");
  assert.equal(chamada.opcoes.headers["X-Idempotency-Key"], "EMP-ABC234-1");
  const corpo = JSON.parse(chamada.opcoes.body);
  assert.equal(corpo.transaction_amount, 160);
  assert.equal(corpo.payment_method_id, "pix");
  assert.equal(corpo.external_reference, "EMP-ABC234");
  assert.equal(corpo.payer.email, "cliente@example.com");
});

test("erro do Mercado Pago não vaza detalhes e responde 502", async () => {
  globalThis.fetch = async () => Response.json({ message: "invalid access token" }, { status: 401 });
  const resp = await post(ambiente(catalogoComPrecos()), pedido);
  assert.equal(resp.status, 502);
  assert.doesNotMatch(JSON.stringify(await resp.json()), /token/);
});

test("consulta o status só quando o pagamento é do mesmo pedido", async () => {
  const env = ambiente(catalogoComPrecos());
  const ok = await worker.fetch(new Request("https://loja.test/api/pix/123456?ref=EMP-ABC234"), env);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, "approved");
  const outro = await worker.fetch(new Request("https://loja.test/api/pix/123456?ref=EMP-ZZZ999"), env);
  assert.equal(outro.status, 404);
  const semRef = await worker.fetch(new Request("https://loja.test/api/pix/123456"), env);
  assert.equal(semRef.status, 404);
});

test("rotas que não são da API servem os arquivos do site", async () => {
  const resp = await worker.fetch(new Request("https://loja.test/index.html"), ambiente(catalogoReal));
  assert.equal(await resp.text(), "arquivo /index.html");
  const api = await worker.fetch(new Request("https://loja.test/api/outra"), ambiente(catalogoReal));
  assert.equal(api.status, 404);
});
