// Servidor da loja na Cloudflare.
// Serve os arquivos de public/ e expõe a API:
//   POST /api/pedidos                  registra o pedido (preços recalculados aqui)
//   GET  /api/pedidos/:codigo?chave=…  status e rastreio do pedido, para o cliente
//   POST /api/pedidos/:codigo/previas/:n         prévia da personalização do item n
//   GET  /api/pedidos/:codigo/previas/:n?chave=… a mesma prévia (link para a loja e o cliente)
//   POST /api/pix                      cria a cobrança Pix do pedido no Mercado Pago
//   GET  /api/pix/:id?ref=…&chave=…    consulta o pagamento no Mercado Pago
//   POST /api/mercadopago/webhook      aviso do Mercado Pago quando um pagamento muda
//   /api/admin/…                       painel da loja (senha no segredo ADMIN_SENHA)
// Segredos ficam no painel da Cloudflare, nunca no código: MP_ACCESS_TOKEN,
// MP_WEBHOOK_SECRET (opcional), ADMIN_SENHA, WHATSAPP_TOKEN e WHATSAPP_PHONE_ID.
// O navegador não decide quanto cobrar nem se o pagamento foi aprovado.

import { STATUS } from "../public/js/status.js";
import { enviarWhatsApp, textoMensagem, telefoneWhatsApp, whatsappConfigurado } from "./whatsapp.js";

export { Pedidos } from "./pedidos-do.js";

const MP_API = "https://api.mercadopago.com/v1/payments";
const QTD_MAX = 20;
const ITENS_MAX = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rota = url.pathname;
    const metodo = request.method;
    try {
      if (rota.startsWith("/api/admin/")) return await rotaAdmin(request, env, url);
      if (rota === "/api/pedidos" && metodo === "POST") return await criarPedido(request, env);
      let m = rota.match(/^\/api\/pedidos\/(EMP-[A-Z0-9]{6})$/);
      if (m && metodo === "GET") return await statusPublico(env, m[1], url.searchParams.get("chave"));
      m = rota.match(/^\/api\/pedidos\/(EMP-[A-Z0-9]{6})\/previas\/(\d{1,2})$/);
      if (m && metodo === "POST") return await receberPrevia(request, env, m[1], Number(m[2]));
      if (m && metodo === "GET") return await mostrarPrevia(env, m[1], Number(m[2]), url.searchParams.get("chave"));
      if (rota === "/api/pix" && metodo === "POST") return await criarPix(request, env);
      m = rota.match(/^\/api\/pix\/(\d{1,20})$/);
      if (m && metodo === "GET") return await consultarPix(request, env, m[1], url.searchParams.get("ref"), url.searchParams.get("chave"));
      if (rota === "/api/mercadopago/webhook" && metodo === "POST") return await webhookMercadoPago(request, env, url);
      if (rota.startsWith("/api/")) return json({ erro: "Rota não encontrada." }, 404);
    } catch (e) {
      console.error("erro na API", e);
      return json({ erro: "Erro inesperado. Tente de novo em instantes." }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function lerArquivo(env, request, caminho) {
  const resp = await env.ASSETS.fetch(new Request(new URL(caminho, request.url)));
  if (!resp.ok) throw new Error(`não foi possível ler ${caminho}`);
  return resp.json();
}

const banco = env => env.PEDIDOS.get(env.PEDIDOS.idFromName("loja"));

const CODIGO = /^EMP-[A-Z0-9]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const texto = (v, max) => String(v ?? "").trim().slice(0, max);
const digitos = v => String(v ?? "").replace(/\D/g, "");

/**
 * Confere o pedido enviado pelo navegador e monta a versão que fica guardada.
 * Preços, nomes e medidas vêm do catálogo; do navegador só aproveitamos
 * produto, modelo, quantidade, a descrição da personalização e os dados do cliente.
 */
export function validarPedido(corpo, catalogo, loja) {
  if (!corpo || typeof corpo !== "object") return { erro: "Pedido inválido." };
  const { codigo, cliente = {}, endereco = {}, itens } = corpo;
  if (!CODIGO.test(String(codigo || ""))) return { erro: "Código do pedido inválido." };
  const nome = texto(cliente.nome, 80);
  if (nome.length < 3) return { erro: "Informe o nome completo." };
  if (![10, 11].includes(digitos(cliente.telefone).length)) return { erro: "Informe o telefone com DDD." };
  const email = texto(cliente.email, 120);
  if (email && !EMAIL.test(email)) return { erro: "Este e-mail não parece válido." };
  if (digitos(endereco.cep).length !== 8) return { erro: "CEP inválido." };
  if (!UFS.includes(endereco.estado)) return { erro: "Estado inválido." };
  for (const campo of ["cidade", "bairro", "rua", "numero"]) if (!texto(endereco[campo], 120)) return { erro: "Endereço incompleto." };
  if (!Array.isArray(itens) || !itens.length || itens.length > ITENS_MAX) return { erro: "O pedido não tem itens válidos." };

  let centavos = 0;
  let precoIndefinido = false;
  const itensServidor = [];
  for (const item of itens) {
    const produto = catalogo.produtos.find(p => p.id === item?.produtoId && p.publicado !== false);
    const modelo = produto?.modelos.find(m => m.id === item?.modeloId && m.publicado !== false);
    const qtd = Number(item?.quantidade);
    if (!modelo || modelo.disponibilidade === "indisponivel") return { erro: "Um dos produtos não está mais disponível." };
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > QTD_MAX) return { erro: "Quantidade inválida." };
    const preco = typeof modelo.preco === "number" ? modelo.preco : null;
    if (preco == null) precoIndefinido = true;
    else centavos += Math.round(preco * 100) * qtd;
    itensServidor.push({
      produtoId: produto.id,
      produtoNome: produto.nome,
      modeloId: modelo.id,
      modeloNome: modelo.nome,
      dimensoes: modelo.dimensoes || null,
      quantidade: qtd,
      precoUnitario: preco,
      fonte: ["upload", "arte", "texto"].includes(item.fonte) ? item.fonte : null,
      personalizacaoTexto: texto(item.personalizacaoTexto, 120) || null,
      previaAprovada: item.previaAprovada === true,
    });
  }
  const entrega = loja.entrega || {};
  const frete = entrega.configurada && typeof entrega.valor === "number" ? entrega.valor : null;
  const subtotal = precoIndefinido ? null : centavos / 100;
  const total = precoIndefinido ? null : (centavos + Math.round((frete || 0) * 100)) / 100;
  if (total !== null && total <= 0) return { erro: "Valor do pedido inválido." };

  return {
    pedido: {
      codigo,
      criadoEm: new Date().toISOString(),
      cliente: { nome, telefone: texto(cliente.telefone, 20), email: email || null, aceitaWhatsApp: cliente.aceitaWhatsApp === true },
      endereco: {
        cep: texto(endereco.cep, 9), estado: endereco.estado, cidade: texto(endereco.cidade, 120), bairro: texto(endereco.bairro, 120),
        rua: texto(endereco.rua, 120), numero: texto(endereco.numero, 20), complemento: texto(endereco.complemento, 120) || null,
      },
      observacoes: texto(corpo.observacoes, 500) || null,
      itens: itensServidor,
      valores: { subtotal, frete, total, precoAConfirmar: precoIndefinido, entregaMensagem: entrega.configurada ? null : entrega.mensagem || "Entrega a combinar." },
      pagamento: { metodo: "pix", modo: loja.pagamento?.modo || "demonstracao", confirmado: false },
    },
  };
}

function novaChave() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}

/** O que o site do cliente recebe de volta. Nunca inclui o histórico interno. */
function visaoCliente(p) {
  return {
    codigo: p.codigo,
    status: p.status,
    itens: p.itens,
    valores: p.valores,
    pagamentoConfirmado: Boolean(p.pagamento?.confirmado),
    rastreio: p.rastreio || null,
  };
}

async function criarPedido(request, env) {
  if (!env.PEDIDOS) return json({ erro: "O registro de pedidos ainda não foi configurado.", codigoErro: "nao_configurado" }, 503);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }
  const [catalogo, loja] = await Promise.all([lerArquivo(env, request, "/data/catalogo.json"), lerArquivo(env, request, "/data/loja.json")]);
  const r = validarPedido(corpo, catalogo, loja);
  if (r.erro) return json(r, 400);
  const chave = novaChave();
  const criado = await banco(env).criar({ ...r.pedido, chave });
  if (!criado) return json({ erro: "Este código de pedido já existe.", codigoErro: "codigo_repetido" }, 409);
  return json({ ...visaoCliente(criado), chave }, 201);
}

/** Busca o pedido e confere a chave que só o navegador do cliente conhece. */
async function pedidoDoCliente(env, codigo, chave) {
  if (!env.PEDIDOS || !CODIGO.test(String(codigo || "")) || !chave) return null;
  const p = await banco(env).obter(codigo);
  return p && p.chave === chave ? p : null;
}

async function statusPublico(env, codigo, chave) {
  const p = await pedidoDoCliente(env, codigo, chave);
  return p ? json(visaoCliente(p)) : json({ erro: "Pedido não encontrado." }, 404);
}

// ---------------------------------------------------------------- prévias das personalizações

const PREVIA_MAX_BYTES = 1_200_000;
const PREVIA_TIPOS = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };

/** Confere uma imagem enviada como data URL. Devolve { tipo, base64 } ou null. */
export function validarPrevia(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const [, tipo, base64] = m;
  if (base64.length > Math.ceil(PREVIA_MAX_BYTES / 3) * 4) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(base64.slice(0, 16)), c => c.charCodeAt(0)); } catch { return null; }
  if (!PREVIA_TIPOS[tipo].every((b, i) => bytes[i] === b)) return null;
  return { tipo, base64 };
}

async function receberPrevia(request, env, codigo, item) {
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: "Prévia inválida." }, 400); }
  const p = await pedidoDoCliente(env, codigo, corpo?.chave);
  if (!p) return json({ erro: "Pedido não encontrado." }, 404);
  const img = validarPrevia(corpo.imagem);
  if (!img) return json({ erro: "A prévia precisa ser uma imagem JPEG ou PNG de até 1,2 MB." }, 400);
  const r = await banco(env).salvarPrevia(codigo, item, img.tipo, img.base64);
  if (r.erro === "item_invalido") return json({ erro: "Item do pedido não encontrado." }, 404);
  if (r.erro) return json({ erro: "Este pedido não aceita mais prévias." }, 409);
  return json({ ok: true }, 201);
}

function respostaImagem(previa, nome) {
  const bytes = Uint8Array.from(atob(previa.dados), c => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": previa.tipo,
      "Content-Disposition": `inline; filename="${nome}.${previa.tipo === "image/png" ? "png" : "jpg"}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function mostrarPrevia(env, codigo, item, chave) {
  const p = await pedidoDoCliente(env, codigo, chave);
  const previa = p && (await banco(env).lerPrevia(codigo, item));
  return previa ? respostaImagem(previa, `${codigo}-item${item + 1}`) : json({ erro: "Prévia não encontrada." }, 404);
}

// ---------------------------------------------------------------- Pix pelo Mercado Pago

async function criarPix(request, env) {
  if (!env.MP_ACCESS_TOKEN) return json({ erro: "O pagamento pelo Mercado Pago ainda não foi configurado pela loja.", codigoErro: "nao_configurado" }, 503);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }
  const p = await pedidoDoCliente(env, corpo?.codigo, corpo?.chave);
  if (!p) return json({ erro: "Pedido não encontrado.", codigoErro: "pedido_nao_encontrado" }, 404);
  if (p.pagamento?.confirmado) return json({ erro: "Este pedido já foi pago.", codigoErro: "ja_pago" }, 409);
  if (p.status !== "aguardando_pagamento") return json({ erro: "Este pedido não está aguardando pagamento." }, 409);
  if (p.valores.total == null) return json({ erro: "O preço de um dos produtos ainda não foi definido. A loja vai combinar o valor pelo WhatsApp.", codigoErro: "preco_indefinido" }, 409);
  if (!p.cliente.email) return json({ erro: "Informe um e-mail válido para o pagamento." }, 400);

  const tentativa = Math.min(9, Math.max(0, Number(corpo.tentativa) || 0));
  const anterior = p.pagamento?.mercadoPago;
  if (anterior && anterior.tentativa === tentativa) return json(anterior);

  const [primeiroNome, ...resto] = p.cliente.nome.split(/\s+/);
  const urlAviso = new URL("/api/mercadopago/webhook", request.url);
  const resp = await fetch(MP_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      // Evita cobrança duplicada se o cliente tocar duas vezes ou recarregar a página.
      "X-Idempotency-Key": `${p.codigo}-${tentativa}`,
    },
    body: JSON.stringify({
      transaction_amount: p.valores.total,
      description: `Pedido ${p.codigo} - Mats & Mouse Pads Empire`,
      payment_method_id: "pix",
      external_reference: p.codigo,
      // O Mercado Pago só avisa endereços https (o site publicado).
      notification_url: urlAviso.protocol === "https:" ? urlAviso.href : undefined,
      payer: { email: p.cliente.email, first_name: primeiroNome || undefined, last_name: resto.join(" ") || undefined },
    }),
  });
  const pagamento = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Mercado Pago recusou a criação do Pix", resp.status, pagamento?.message);
    return json({ erro: "O Mercado Pago não conseguiu gerar o Pix agora. Tente de novo em instantes." }, 502);
  }
  const dados = pagamento.point_of_interaction?.transaction_data || {};
  const pix = {
    id: String(pagamento.id),
    status: pagamento.status,
    valor: pagamento.transaction_amount,
    copiaECola: dados.qr_code || null,
    qrCodeBase64: dados.qr_code_base64 || null,
    expiraEm: pagamento.date_of_expiration || null,
    tentativa,
  };
  await banco(env).registrarPix(p.codigo, pix);
  return json(pix);
}

async function buscarPagamentoMP(env, id) {
  const resp = await fetch(`${MP_API}/${id}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
  if (resp.status === 404) return { naoEncontrado: true };
  if (!resp.ok) return { falhou: true };
  return { pagamento: await resp.json() };
}

/**
 * Pagamento aprovado, confirmado direto com o Mercado Pago: marca o pedido
 * como pago e avisa o cliente pelo WhatsApp (uma vez só).
 */
async function registrarAprovacao(request, env, pagamento) {
  const db = banco(env);
  const p = await db.obter(String(pagamento.external_reference || ""));
  if (!p) return null;
  if (p.valores.total == null || Math.abs(Number(pagamento.transaction_amount) - p.valores.total) > 0.005) {
    console.error("valor pago diferente do pedido", p.codigo, pagamento.transaction_amount, p.valores.total);
    return p;
  }
  const r = await db.confirmarPagamento(p.codigo, {
    aprovadoEm: pagamento.date_approved || null,
    mercadoPago: { id: String(pagamento.id), status: pagamento.status },
  }, "provedor");
  if (r.mudou) return notificar(request, env, "pago", r.pedido);
  return r.pedido || p;
}

async function consultarPix(request, env, id, ref, chave) {
  if (!env.MP_ACCESS_TOKEN) return json({ erro: "Pagamento não configurado.", codigoErro: "nao_configurado" }, 503);
  const p = await pedidoDoCliente(env, ref, chave);
  if (!p || p.pagamento?.mercadoPago?.id !== id) return json({ erro: "Pagamento não encontrado." }, 404);
  const r = await buscarPagamentoMP(env, id);
  if (r.naoEncontrado) return json({ erro: "Pagamento não encontrado." }, 404);
  if (r.falhou) return json({ erro: "Não foi possível consultar o pagamento agora." }, 502);
  // Só responde se o pagamento for mesmo deste pedido.
  if (r.pagamento.external_reference !== ref) return json({ erro: "Pagamento não encontrado." }, 404);
  let atual = p;
  if (r.pagamento.status === "approved") atual = (await registrarAprovacao(request, env, r.pagamento)) || p;
  return json({
    id: String(r.pagamento.id),
    status: r.pagamento.status,
    valor: r.pagamento.transaction_amount,
    aprovadoEm: r.pagamento.date_approved || null,
    pedido: visaoCliente(atual),
  });
}

async function hmacHex(segredo, mensagem) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return Array.from(new Uint8Array(assinatura), b => b.toString(16).padStart(2, "0")).join("");
}

/** Confere o cabeçalho x-signature do Mercado Pago (quando MP_WEBHOOK_SECRET existe). */
export async function assinaturaValida(segredo, cabecalhos, idDado) {
  const partes = Object.fromEntries(String(cabecalhos.get("x-signature") || "").split(",").map(s => s.trim().split("=")));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(idDado) ? idDado.toLowerCase() : idDado;
  const manifesto = `id:${id};request-id:${cabecalhos.get("x-request-id") || ""};ts:${partes.ts};`;
  return iguais(await hmacHex(segredo, manifesto), partes.v1);
}

async function webhookMercadoPago(request, env, url) {
  if (!env.MP_ACCESS_TOKEN || !env.PEDIDOS) return json({ ok: false }, 503);
  const corpo = await request.json().catch(() => ({}));
  const tipo = corpo.type || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = String(url.searchParams.get("data.id") || corpo?.data?.id || url.searchParams.get("id") || "");
  if (env.MP_WEBHOOK_SECRET && !(await assinaturaValida(env.MP_WEBHOOK_SECRET, request.headers, id))) return json({ ok: false }, 401);
  if (tipo !== "payment" || !/^\d{1,20}$/.test(id)) return json({ ok: true, ignorado: true });
  // Nunca confiamos no corpo do aviso: o status é consultado direto no Mercado Pago.
  const r = await buscarPagamentoMP(env, id);
  if (r.falhou) return json({ ok: false }, 502); // o Mercado Pago tenta de novo depois
  if (r.pagamento?.status === "approved") await registrarAprovacao(request, env, r.pagamento);
  return json({ ok: true });
}

// ---------------------------------------------------------------- WhatsApp

async function notificar(request, env, tipo, p) {
  const loja = await lerArquivo(env, request, "/data/loja.json").catch(() => ({}));
  const resultado = await enviarWhatsApp(env, loja.notificacoes?.whatsapp, tipo, p);
  return (await banco(env).registrarNotificacao(p.codigo, resultado)) || p;
}

// ---------------------------------------------------------------- painel da loja

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// Espaços nas pontas e formas diferentes do mesmo acento não contam.
const normalizarSenha = s => String(s).trim().normalize("NFC");

function decodificarSenha(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

async function resumoSenha(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizarSenha(s)));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("");
}

async function autenticar(request, env) {
  if (!env.ADMIN_SENHA || !env.PEDIDOS) return json({ erro: "O painel ainda não foi configurado. Cadastre o segredo ADMIN_SENHA na Cloudflare.", codigoErro: "nao_configurado" }, 503);
  const db = banco(env);
  if (await db.loginBloqueado()) return json({ erro: "Muitas tentativas com senha errada. Espere 15 minutos." }, 429);
  const enviada = decodificarSenha((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  if (normalizarSenha(enviada) && iguais(await resumoSenha(enviada), await resumoSenha(env.ADMIN_SENHA))) return null;
  await db.registrarFalhaLogin();
  return json({ erro: "Senha incorreta." }, 401);
}

function linkWhatsApp(p, tipo) {
  const tel = telefoneWhatsApp(p.cliente.telefone);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(textoMensagem(tipo, p))}` : null;
}

function visaoAdmin(p) {
  const { chave, ...resto } = p;
  return {
    ...resto,
    statusNome: STATUS[p.status] || p.status,
    mensagens: {
      pago: p.pagamento?.confirmado ? { texto: textoMensagem("pago", p), link: linkWhatsApp(p, "pago") } : null,
      enviado: p.rastreio ? { texto: textoMensagem("enviado", p), link: linkWhatsApp(p, "enviado") } : null,
    },
  };
}

const respostaAcao = r =>
  r.erro === "nao_encontrado" ? json({ erro: "Pedido não encontrado." }, 404)
  : r.erro ? json({ erro: "Essa mudança de status não é permitida agora.", pedido: r.pedido && visaoAdmin(r.pedido) }, 409)
  : null;

async function rotaAdmin(request, env, url) {
  const negado = await autenticar(request, env);
  if (negado) return negado;
  const db = banco(env);
  const rota = url.pathname.replace(/^\/api\/admin/, "");
  const metodo = request.method;
  const corpo = metodo === "POST" ? await request.json().catch(() => ({})) : null;

  if (rota === "/config" && metodo === "GET") {
    return json({ whatsappAutomatico: whatsappConfigurado(env), mercadoPago: Boolean(env.MP_ACCESS_TOKEN), webhookAssinado: Boolean(env.MP_WEBHOOK_SECRET), status: STATUS });
  }
  if (rota === "/pedidos" && metodo === "GET") {
    const lista = await db.listar();
    return json(lista.map(p => ({
      codigo: p.codigo, criadoEm: p.criadoEm, status: p.status, statusNome: STATUS[p.status] || p.status,
      nome: p.cliente.nome, total: p.valores.total, pago: Boolean(p.pagamento?.confirmado), rastreio: p.rastreio?.codigo || null,
    })));
  }
  const mp = rota.match(/^\/pedidos\/(EMP-[A-Z0-9]{6})\/previas\/(\d{1,2})$/);
  if (mp && metodo === "GET") {
    const previa = await db.lerPrevia(mp[1], Number(mp[2]));
    return previa ? respostaImagem(previa, `${mp[1]}-item${Number(mp[2]) + 1}`) : json({ erro: "Prévia não encontrada." }, 404);
  }
  const m = rota.match(/^\/pedidos\/(EMP-[A-Z0-9]{6})(\/status|\/rastreio|\/notificar)?$/);
  if (!m) return json({ erro: "Rota não encontrada." }, 404);
  const [, codigo, acao] = m;

  if (!acao && metodo === "GET") {
    const p = await db.obter(codigo);
    return p ? json(visaoAdmin(p)) : json({ erro: "Pedido não encontrado." }, 404);
  }
  if (metodo !== "POST") return json({ erro: "Rota não encontrada." }, 404);

  if (acao === "/status") {
    if (!(corpo.status in STATUS)) return json({ erro: "Status inválido." }, 400);
    const r = await db.mudarStatus(codigo, corpo.status);
    const falha = respostaAcao(r);
    if (falha) return falha;
    let p = r.pedido;
    if (r.mudou && corpo.status === "pagamento_confirmado") p = await notificar(request, env, "pago", p);
    return json(visaoAdmin(p));
  }
  if (acao === "/rastreio") {
    const rastreio = { transportadora: texto(corpo.transportadora, 60), codigo: texto(corpo.codigo, 60), link: texto(corpo.link, 300) || null };
    if (!rastreio.transportadora || !rastreio.codigo) return json({ erro: "Informe a transportadora e o código de rastreio." }, 400);
    if (rastreio.link && !/^https:\/\/[^\s]+$/.test(rastreio.link)) return json({ erro: "O link de rastreio precisa começar com https://" }, 400);
    const r = await db.salvarRastreio(codigo, rastreio);
    const falha = respostaAcao(r);
    if (falha) return falha;
    return json(visaoAdmin(await notificar(request, env, "enviado", r.pedido)));
  }
  if (acao === "/notificar") {
    const p = await db.obter(codigo);
    if (!p) return json({ erro: "Pedido não encontrado." }, 404);
    if (corpo.tipo === "pago" && !p.pagamento?.confirmado) return json({ erro: "O pedido ainda não foi pago." }, 409);
    if (corpo.tipo === "enviado" && !p.rastreio) return json({ erro: "O pedido ainda não tem rastreio." }, 409);
    if (!["pago", "enviado"].includes(corpo.tipo)) return json({ erro: "Tipo de mensagem inválido." }, 400);
    return json(visaoAdmin(await notificar(request, env, corpo.tipo, p)));
  }
  return json({ erro: "Rota não encontrada." }, 404);
}
