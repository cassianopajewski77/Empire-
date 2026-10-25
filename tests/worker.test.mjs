// Testes do servidor (src/) com Mercado Pago, WhatsApp e banco simulados.
// Rodar: npm test
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import worker, { validarPedido, assinaturaValida } from "../src/worker.js";
import { telefoneWhatsApp, parametrosModelo, textoMensagem } from "../src/whatsapp.js";
import { bancoFalso } from "./suporte/ambiente.mjs";

const RAIZ = new URL("../public/", import.meta.url);
const catalogoReal = JSON.parse(await readFile(new URL("data/catalogo.json", RAIZ), "utf8"));
const lojaReal = JSON.parse(await readFile(new URL("data/loja.json", RAIZ), "utf8"));

function catalogoComPrecos() {
  const c = structuredClone(catalogoReal);
  const precos = { p: 30, m: 40, g: 120, classico: 80, divertido: 85 };
  for (const p of c.produtos) for (const m of p.modelos) m.preco = precos[m.id];
  return c;
}

function ambiente({ catalogo = catalogoComPrecos(), ...extra } = {}) {
  return {
    MP_ACCESS_TOKEN: "TEST-token",
    ADMIN_SENHA: "senha-da-loja",
    WHATSAPP_TOKEN: "wa-token",
    WHATSAPP_PHONE_ID: "1234",
    PEDIDOS: bancoFalso(),
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

const pedidoBase = () => ({
  codigo: "EMP-ABC234",
  cliente: { nome: "Cliente Teste", telefone: "(41) 99999-8888", email: "cliente@example.com", aceitaWhatsApp: true },
  endereco: { cep: "80010-000", estado: "PR", cidade: "Curitiba", bairro: "Centro", rua: "Rua XV", numero: "10" },
  itens: [
    { produtoId: "mousepad", modeloId: "m", quantidade: 2, precoUnitario: 0.01, personalizacaoTexto: "Arte da loja: Neon Gamer", fonte: "arte" },
    { produtoId: "tapete-pet", modeloId: "classico", quantidade: 1, personalizacaoTexto: "Imagem enviada: rex.jpg", fonte: "upload" },
  ],
});

// Mercado Pago e WhatsApp simulados
let mp, whats, chamadasMP;
const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  mp = new Map(); whats = []; chamadasMP = [];
  let proximo = 123456;
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.startsWith("https://graph.facebook.com/")) {
      whats.push({ url: u, opcoes, corpo: JSON.parse(opcoes.body) });
      return Response.json({ messages: [{ id: "wamid.1" }] });
    }
    chamadasMP.push({ url: u, opcoes });
    if (opcoes.method === "POST") {
      const corpo = JSON.parse(opcoes.body);
      const id = String(proximo++);
      mp.set(id, { id: Number(id), status: "pending", transaction_amount: corpo.transaction_amount, external_reference: corpo.external_reference });
      return Response.json({ ...mp.get(id), point_of_interaction: { transaction_data: { qr_code: "00020126PIX" + id, qr_code_base64: "iVBORw0KGgo=" } } }, { status: 201 });
    }
    const pag = mp.get(u.split("/").pop());
    return pag ? Response.json(pag) : Response.json({}, { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const chamar = (env, caminho, { metodo = "GET", corpo, cabecalhos = {} } = {}) =>
  worker.fetch(new Request("https://loja.test" + caminho, { method: metodo, headers: cabecalhos, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), env);
const admin = (env, caminho, opcoes = {}) => chamar(env, "/api/admin" + caminho, { ...opcoes, cabecalhos: { Authorization: "Bearer senha-da-loja" } });

async function criarPedidoPago(env) {
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  const pix = await (await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } })).json();
  mp.get(pix.id).status = "approved";
  mp.get(pix.id).date_approved = "2026-10-25T10:00:00.000-03:00";
  const consulta = await (await chamar(env, `/api/pix/${pix.id}?ref=${criado.codigo}&chave=${criado.chave}`)).json();
  return { criado, pix, consulta };
}

test("valida o pedido e calcula o total com os preços do catálogo, ignorando o navegador", () => {
  const r = validarPedido(pedidoBase(), catalogoComPrecos(), lojaReal);
  assert.equal(r.pedido.valores.total, 40 * 2 + 80);
  assert.equal(r.pedido.itens[0].precoUnitario, 40);
  assert.equal(r.pedido.itens[0].modeloNome, "Mousepad Standard");
  assert.equal(r.pedido.cliente.aceitaWhatsApp, true);
  const semPreco = catalogoComPrecos();
  semPreco.produtos[1].modelos[0].preco = null;
  const r2 = validarPedido(pedidoBase(), semPreco, lojaReal);
  assert.equal(r2.pedido.valores.total, null);
  assert.equal(r2.pedido.valores.precoAConfirmar, true);
});

test("recusa pedido com dados inválidos", () => {
  const c = catalogoComPrecos();
  const com = muda => { const p = pedidoBase(); muda(p); return validarPedido(p, c, lojaReal).erro; };
  assert.ok(com(p => (p.codigo = "X")));
  assert.ok(com(p => (p.cliente.nome = "A")));
  assert.ok(com(p => (p.cliente.telefone = "9999")));
  assert.ok(com(p => (p.cliente.email = "sem-arroba")));
  assert.ok(com(p => (p.endereco.cep = "123")));
  assert.ok(com(p => (p.endereco.estado = "XX")));
  assert.ok(com(p => (p.endereco.rua = "")));
  assert.ok(com(p => (p.itens = [])));
  assert.ok(com(p => (p.itens[0].modeloId = "zz")));
  assert.ok(com(p => (p.itens[0].quantidade = 2.5)));
});

test("registra o pedido no servidor e não aceita código repetido", async () => {
  const env = ambiente();
  const resp = await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() });
  assert.equal(resp.status, 201);
  const r = await resp.json();
  assert.match(r.chave, /^[0-9a-f]{32}$/);
  assert.equal(r.status, "aguardando_pagamento");
  assert.equal(r.valores.total, 160);
  const repetido = await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() });
  assert.equal(repetido.status, 409);
  assert.equal((await repetido.json()).codigoErro, "codigo_repetido");
  const status = await chamar(env, `/api/pedidos/EMP-ABC234?chave=${r.chave}`);
  assert.equal((await status.json()).status, "aguardando_pagamento");
  assert.equal((await chamar(env, "/api/pedidos/EMP-ABC234?chave=errada")).status, 404);
});

test("cria o Pix com o valor guardado no servidor, sem cobrar duas vezes", async () => {
  const env = ambiente();
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  const resp = await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } });
  assert.equal(resp.status, 200);
  const pix = await resp.json();
  assert.equal(pix.valor, 160);
  assert.equal(pix.copiaECola, "00020126PIX123456");
  const [chamada] = chamadasMP;
  assert.equal(chamada.opcoes.headers.Authorization, "Bearer TEST-token");
  assert.equal(chamada.opcoes.headers["X-Idempotency-Key"], "EMP-ABC234-0");
  const corpo = JSON.parse(chamada.opcoes.body);
  assert.equal(corpo.transaction_amount, 160);
  assert.equal(corpo.external_reference, "EMP-ABC234");
  assert.equal(corpo.notification_url, "https://loja.test/api/mercadopago/webhook");
  // recarregar a página devolve o mesmo Pix
  const denovo = await (await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } })).json();
  assert.equal(denovo.id, pix.id);
  assert.equal(chamadasMP.length, 1);
  // chave errada não gera cobrança
  assert.equal((await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: "x" } })).status, 404);
});

test("Pix recusado sem token, sem preço definido ou com erro do Mercado Pago", async () => {
  const semToken = ambiente({ MP_ACCESS_TOKEN: undefined });
  assert.equal((await chamar(semToken, "/api/pix", { metodo: "POST", corpo: {} })).status, 503);

  const semPreco = catalogoComPrecos();
  semPreco.produtos.find(p => p.id === "tapete-pet").modelos[0].preco = null;
  const env = ambiente({ catalogo: semPreco });
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  const resp = await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } });
  assert.equal(resp.status, 409);
  assert.equal((await resp.json()).codigoErro, "preco_indefinido");
  assert.equal(chamadasMP.length, 0);

  const env2 = ambiente();
  const c2 = await (await chamar(env2, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  globalThis.fetch = async () => Response.json({ message: "invalid access token" }, { status: 401 });
  const erro = await chamar(env2, "/api/pix", { metodo: "POST", corpo: { codigo: c2.codigo, chave: c2.chave } });
  assert.equal(erro.status, 502);
  assert.doesNotMatch(JSON.stringify(await erro.json()), /token/);
});

test("pagamento aprovado confirma o pedido e manda o espelho no WhatsApp uma vez só", async () => {
  const env = ambiente();
  const { criado, pix, consulta } = await criarPedidoPago(env);
  assert.equal(consulta.status, "approved");
  assert.equal(consulta.pedido.status, "pagamento_confirmado");
  assert.equal(whats.length, 1);
  const msg = whats[0].corpo;
  assert.equal(whats[0].url, "https://graph.facebook.com/v23.0/1234/messages");
  assert.equal(whats[0].opcoes.headers.Authorization, "Bearer wa-token");
  assert.equal(msg.to, "5541999998888");
  assert.equal(msg.template.name, "pedido_pago");
  const params = msg.template.components[0].parameters.map(p => p.text);
  assert.equal(params[0], "Cliente");
  assert.equal(params[1], "EMP-ABC234");
  assert.match(params[2], /2× Mousepad personalizado: Mousepad Standard 30 × 25 cm \(Arte da loja: Neon Gamer\)/);
  assert.match(params[3], /R\$\s160,00/);
  assert.match(params[4], /Rua XV, 10/);
  // consultar de novo ou receber o aviso do Mercado Pago não repete a mensagem
  await chamar(env, `/api/pix/${pix.id}?ref=${criado.codigo}&chave=${criado.chave}`);
  await chamar(env, "/api/mercadopago/webhook?data.id=" + pix.id + "&type=payment", { metodo: "POST", corpo: { type: "payment", data: { id: pix.id } } });
  assert.equal(whats.length, 1);
  const p = await (await admin(env, "/pedidos/EMP-ABC234")).json();
  assert.equal(p.notificacoes.length, 1);
  assert.equal(p.notificacoes[0].situacao, "enviada");
  assert.equal(p.pagamento.confirmadoPor, "provedor");
});

test("aviso do Mercado Pago confirma o pagamento mesmo com a página fechada", async () => {
  const env = ambiente({ MP_WEBHOOK_SECRET: "segredo-webhook" });
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  const pix = await (await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } })).json();
  mp.get(pix.id).status = "approved";
  const caminho = `/api/mercadopago/webhook?data.id=${pix.id}&type=payment`;
  // sem assinatura válida é recusado
  assert.equal((await chamar(env, caminho, { metodo: "POST", corpo: { type: "payment", data: { id: pix.id } } })).status, 401);
  const ts = "1729850000";
  const v1 = createHmac("sha256", "segredo-webhook").update(`id:${pix.id};request-id:req-1;ts:${ts};`).digest("hex");
  const resp = await chamar(env, caminho, { metodo: "POST", corpo: { type: "payment", data: { id: pix.id } }, cabecalhos: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1" } });
  assert.equal(resp.status, 200);
  const status = await (await chamar(env, `/api/pedidos/${criado.codigo}?chave=${criado.chave}`)).json();
  assert.equal(status.status, "pagamento_confirmado");
  assert.equal(whats.length, 1);
});

test("valor pago diferente do pedido não confirma", async () => {
  const env = ambiente();
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  const pix = await (await chamar(env, "/api/pix", { metodo: "POST", corpo: { codigo: criado.codigo, chave: criado.chave } })).json();
  Object.assign(mp.get(pix.id), { status: "approved", transaction_amount: 1 });
  await chamar(env, `/api/mercadopago/webhook?data.id=${pix.id}&type=payment`, { metodo: "POST", corpo: {} });
  const status = await (await chamar(env, `/api/pedidos/${criado.codigo}?chave=${criado.chave}`)).json();
  assert.equal(status.status, "aguardando_pagamento");
  assert.equal(whats.length, 0);
});

test("painel exige a senha e bloqueia depois de muitas tentativas", async () => {
  assert.equal((await chamar(ambiente({ ADMIN_SENHA: undefined }), "/api/admin/pedidos")).status, 503);
  const env = ambiente();
  assert.equal((await chamar(env, "/api/admin/pedidos")).status, 401);
  for (let i = 0; i < 9; i++) await chamar(env, "/api/admin/pedidos", { cabecalhos: { Authorization: "Bearer errada" } });
  assert.equal((await admin(env, "/pedidos")).status, 429);
});

test("painel lista pedidos, lança o rastreio e avisa o cliente", async () => {
  const env = ambiente();
  await criarPedidoPago(env);
  const lista = await (await admin(env, "/pedidos")).json();
  assert.deepEqual(lista.map(p => [p.codigo, p.status, p.pago]), [["EMP-ABC234", "pagamento_confirmado", true]]);
  assert.equal("chave" in (await (await admin(env, "/pedidos/EMP-ABC234")).json()), false);
  // pular para "entregue" não é permitido
  assert.equal((await admin(env, "/pedidos/EMP-ABC234/status", { metodo: "POST", corpo: { status: "entregue" } })).status, 409);
  assert.equal((await admin(env, "/pedidos/EMP-ABC234/status", { metodo: "POST", corpo: { status: "em_producao" } })).status, 200);
  assert.equal((await admin(env, "/pedidos/EMP-ABC234/rastreio", { metodo: "POST", corpo: { transportadora: "Correios" } })).status, 400);
  const resp = await admin(env, "/pedidos/EMP-ABC234/rastreio", { metodo: "POST", corpo: { transportadora: "Correios", codigo: "AA123456789BR", link: "https://rastreamento.correios.com.br/" } });
  assert.equal(resp.status, 200);
  const p = await resp.json();
  assert.equal(p.status, "enviado");
  assert.equal(p.rastreio.codigo, "AA123456789BR");
  const msg = whats.at(-1).corpo;
  assert.equal(msg.template.name, "pedido_enviado");
  assert.deepEqual(msg.template.components[0].parameters.map(x => x.text), ["Cliente", "EMP-ABC234", "Correios", "AA123456789BR", "https://rastreamento.correios.com.br/"]);
  assert.match(decodeURIComponent(p.mensagens.enviado.link), /^https:\/\/wa\.me\/5541999998888\?text=Olá, Cliente! O seu pedido \*EMP-ABC234\* foi enviado/);
  // o cliente vê o rastreio na página do pedido
  const chave = (await env.PEDIDOS.instancia.obter("EMP-ABC234")).chave;
  const status = await (await chamar(env, `/api/pedidos/EMP-ABC234?chave=${chave}`)).json();
  assert.equal(status.rastreio.codigo, "AA123456789BR");
});

test("sem consentimento ou sem WhatsApp configurado, nada é enviado e o painel oferece o envio manual", async () => {
  const env = ambiente({ WHATSAPP_TOKEN: undefined });
  const criado = await (await chamar(env, "/api/pedidos", { metodo: "POST", corpo: pedidoBase() })).json();
  // Pix combinado no WhatsApp: a loja confere e confirma no painel
  const r = await (await admin(env, `/pedidos/${criado.codigo}/status`, { metodo: "POST", corpo: { status: "pagamento_confirmado" } })).json();
  assert.equal(r.status, "pagamento_confirmado");
  assert.equal(r.pagamento.confirmadoPor, "conferencia_manual");
  assert.equal(r.notificacoes[0].situacao, "nao_configurado");
  assert.equal(whats.length, 0);
  assert.match(decodeURIComponent(r.mensagens.pago.link), /Recebemos o seu pedido \*EMP-ABC234\* e o pagamento foi confirmado com sucesso/);

  const env2 = ambiente();
  const sem = pedidoBase(); sem.cliente.aceitaWhatsApp = false;
  const c2 = await (await chamar(env2, "/api/pedidos", { metodo: "POST", corpo: sem })).json();
  const r2 = await (await admin(env2, `/pedidos/${c2.codigo}/status`, { metodo: "POST", corpo: { status: "pagamento_confirmado" } })).json();
  assert.equal(r2.notificacoes[0].situacao, "sem_consentimento");
  assert.equal(whats.length, 0);
});

test("mensagens: telefone no formato do WhatsApp e parâmetros sem quebra de linha", async () => {
  assert.equal(telefoneWhatsApp("(41) 99999-8888"), "5541999998888");
  assert.equal(telefoneWhatsApp("4133334444"), "554133334444");
  assert.equal(telefoneWhatsApp("123"), null);
  const p = validarPedido(pedidoBase(), catalogoComPrecos(), lojaReal).pedido;
  p.endereco.complemento = "Apto 1\n\nBloco    B";
  for (const x of parametrosModelo("pago", p)) assert.doesNotMatch(x.text, /\n|\s{2,}/);
  assert.match(textoMensagem("pago", p), /Acompanhe a entrega por este WhatsApp/);
  const assinatura = createHmac("sha256", "s").update("id:abc;request-id:r;ts:1;").digest("hex");
  assert.ok(await assinaturaValida("s", new Headers({ "x-signature": `ts=1,v1=${assinatura}`, "x-request-id": "r" }), "ABC"));
});

test("rotas que não são da API servem os arquivos do site", async () => {
  const env = ambiente();
  assert.equal(await (await chamar(env, "/index.html")).text(), "arquivo /index.html");
  assert.equal((await chamar(env, "/api/outra")).status, 404);
});
