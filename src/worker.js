// Servidor da loja na Cloudflare.
// Serve os arquivos de public/ e expõe duas rotas de pagamento Pix pelo Mercado Pago:
//   POST /api/pix            cria a cobrança Pix do pedido e devolve o QR Code
//   GET  /api/pix/:id?ref=…  consulta o status do pagamento direto no Mercado Pago
// O token do Mercado Pago fica no segredo MP_ACCESS_TOKEN (painel da Cloudflare),
// nunca no código. O valor é sempre recalculado aqui a partir do catálogo: o
// navegador não decide quanto cobrar nem se o pagamento foi aprovado.

const MP_API = "https://api.mercadopago.com/v1/payments";
const QTD_MAX = 20;
const ITENS_MAX = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/pix" && request.method === "POST") return await criarPix(request, env);
      const consulta = url.pathname.match(/^\/api\/pix\/(\d{1,20})$/);
      if (consulta && request.method === "GET") return await consultarPix(consulta[1], url.searchParams.get("ref"), env);
      if (url.pathname.startsWith("/api/")) return json({ erro: "Rota não encontrada." }, 404);
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

const CODIGO = /^EMP-[A-Z0-9]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere o pedido enviado pelo navegador e calcula o total com os preços do catálogo. */
export function calcularCobranca(corpo, catalogo, loja) {
  if (!corpo || typeof corpo !== "object") return { erro: "Pedido inválido." };
  const { codigo, cliente, itens } = corpo;
  if (!CODIGO.test(String(codigo || ""))) return { erro: "Código do pedido inválido." };
  if (!cliente || !EMAIL.test(String(cliente.email || "").trim())) return { erro: "Informe um e-mail válido para o pagamento." };
  if (!Array.isArray(itens) || !itens.length || itens.length > ITENS_MAX) return { erro: "O pedido não tem itens válidos." };

  let total = 0;
  for (const item of itens) {
    const produto = catalogo.produtos.find(p => p.id === item?.produtoId && p.publicado !== false);
    const modelo = produto?.modelos.find(m => m.id === item?.modeloId && m.publicado !== false);
    const qtd = Number(item?.quantidade);
    if (!modelo || modelo.disponibilidade === "indisponivel") return { erro: "Um dos produtos não está mais disponível." };
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > QTD_MAX) return { erro: "Quantidade inválida." };
    if (typeof modelo.preco !== "number") return { erro: "O preço de um dos produtos ainda não foi definido. A loja vai combinar o valor pelo WhatsApp.", codigoErro: "preco_indefinido" };
    total += Math.round(modelo.preco * 100) * qtd;
  }
  const entrega = loja.entrega || {};
  if (entrega.configurada && typeof entrega.valor === "number") total += Math.round(entrega.valor * 100);
  if (total <= 0) return { erro: "Valor do pedido inválido." };
  return {
    codigo,
    valor: total / 100,
    email: String(cliente.email).trim(),
    nome: String(cliente.nome || "").trim().slice(0, 60),
  };
}

async function criarPix(request, env) {
  if (!env.MP_ACCESS_TOKEN) return json({ erro: "O pagamento pelo Mercado Pago ainda não foi configurado pela loja.", codigoErro: "nao_configurado" }, 503);
  let corpo;
  try { corpo = await request.json(); } catch { return json({ erro: "Pedido inválido." }, 400); }

  const [catalogo, loja] = await Promise.all([
    lerArquivo(env, request, "/data/catalogo.json"),
    lerArquivo(env, request, "/data/loja.json"),
  ]);
  const cobranca = calcularCobranca(corpo, catalogo, loja);
  if (cobranca.erro) return json(cobranca, cobranca.codigoErro === "preco_indefinido" ? 409 : 400);

  const tentativa = Math.min(9, Math.max(0, Number(corpo.tentativa) || 0));
  const [primeiroNome, ...resto] = cobranca.nome.split(/\s+/);
  const resp = await fetch(MP_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      // Evita cobrança duplicada se o cliente tocar duas vezes ou recarregar a página.
      "X-Idempotency-Key": `${cobranca.codigo}-${tentativa}`,
    },
    body: JSON.stringify({
      transaction_amount: cobranca.valor,
      description: `Pedido ${cobranca.codigo} - Mats & Mouse Pads Empire`,
      payment_method_id: "pix",
      external_reference: cobranca.codigo,
      payer: { email: cobranca.email, first_name: primeiroNome || undefined, last_name: resto.join(" ") || undefined },
    }),
  });
  const pagamento = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Mercado Pago recusou a criação do Pix", resp.status, pagamento?.message);
    return json({ erro: "O Mercado Pago não conseguiu gerar o Pix agora. Tente de novo em instantes." }, 502);
  }
  const dados = pagamento.point_of_interaction?.transaction_data || {};
  return json({
    id: String(pagamento.id),
    status: pagamento.status,
    valor: pagamento.transaction_amount,
    copiaECola: dados.qr_code || null,
    qrCodeBase64: dados.qr_code_base64 || null,
    expiraEm: pagamento.date_of_expiration || null,
  });
}

async function consultarPix(id, ref, env) {
  if (!env.MP_ACCESS_TOKEN) return json({ erro: "Pagamento não configurado.", codigoErro: "nao_configurado" }, 503);
  if (!CODIGO.test(String(ref || ""))) return json({ erro: "Pagamento não encontrado." }, 404);
  const resp = await fetch(`${MP_API}/${id}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
  if (resp.status === 404) return json({ erro: "Pagamento não encontrado." }, 404);
  if (!resp.ok) return json({ erro: "Não foi possível consultar o pagamento agora." }, 502);
  const p = await resp.json();
  // Só responde se o pagamento for mesmo deste pedido.
  if (p.external_reference !== ref) return json({ erro: "Pagamento não encontrado." }, 404);
  return json({ id: String(p.id), status: p.status, valor: p.transaction_amount, aprovadoEm: p.date_approved || null });
}
