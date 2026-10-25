// Mensagens de WhatsApp para o cliente.
// Envio automático pela API oficial do WhatsApp (WhatsApp Cloud API, da Meta), usando
// modelos de mensagem aprovados pela Meta. Precisa dos segredos WHATSAPP_TOKEN e
// WHATSAPP_PHONE_ID na Cloudflare e do consentimento do cliente no checkout.
// Sem isso, o painel mostra o mesmo texto pronto para enviar com um toque.

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = v => (typeof v === "number" ? fmtBRL.format(v) : "a definir");

/** Telefone do checkout ("(41) 99999-8888") no formato do WhatsApp ("5541999998888"). */
export function telefoneWhatsApp(telefone) {
  const d = String(telefone || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

const primeiroNome = p => String(p.cliente?.nome || "").trim().split(/\s+/)[0] || "cliente";

function linhaItem(i) {
  const tam = i.dimensoes?.rotulo ? ` ${i.dimensoes.rotulo}` : "";
  const pers = i.personalizacaoTexto ? ` (${i.personalizacaoTexto})` : "";
  return `${i.quantidade}× ${i.produtoNome}: ${i.modeloNome}${tam}${pers}, ${brl(i.precoUnitario)} cada`;
}

function textoEndereco(e) {
  if (!e) return "";
  return `${e.rua}, ${e.numero}${e.complemento ? " - " + e.complemento : ""}, ${e.bairro}, ${e.cidade}/${e.estado}, CEP ${e.cep}`;
}

const textoEntrega = p => (p.valores?.frete != null ? brl(p.valores.frete) : p.valores?.entregaMensagem || "Entrega a combinar.");

/** Texto completo, usado no botão de um toque do painel. */
export function textoMensagem(tipo, p) {
  const L = [];
  if (tipo === "pago") {
    L.push(`Olá, ${primeiroNome(p)}! Recebemos o seu pedido *${p.codigo}* e o pagamento foi confirmado com sucesso. ✅`);
    L.push("", "*Espelho do pedido*");
    p.itens.forEach((i, n) => L.push(`${n + 1}. ${linhaItem(i)}`));
    L.push(`Entrega: ${textoEntrega(p)}`);
    L.push(`*Total: ${brl(p.valores?.total)}*`);
    L.push(`Endereço: ${textoEndereco(p.endereco)}`);
    L.push("", "Acompanhe a entrega por este WhatsApp: vamos avisar aqui quando o pedido for enviado, com o código de rastreio.");
  } else {
    const r = p.rastreio || {};
    L.push(`Olá, ${primeiroNome(p)}! O seu pedido *${p.codigo}* foi enviado. 📦`);
    L.push("", `Transportadora: ${r.transportadora}`, `Código de rastreio: *${r.codigo}*`);
    if (r.link) L.push(`Acompanhe: ${r.link}`);
    L.push("", "Qualquer dúvida, fale com a gente por aqui.");
  }
  L.push("Mats & Mouse Pads Empire");
  return L.join("\n");
}

// A Meta não aceita quebra de linha nem espaços seguidos dentro de um parâmetro.
const param = t => ({ type: "text", text: String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 1000) || "-" });

/** Parâmetros {{1}}, {{2}}… dos modelos descritos no README. */
export function parametrosModelo(tipo, p) {
  if (tipo === "pago") {
    return [primeiroNome(p), p.codigo, p.itens.map(linhaItem).join("; "), brl(p.valores?.total), `${textoEntrega(p)} Endereço: ${textoEndereco(p.endereco)}`].map(param);
  }
  const r = p.rastreio || {};
  return [primeiroNome(p), p.codigo, r.transportadora, r.codigo, r.link || "no site da transportadora"].map(param);
}

export function whatsappConfigurado(env) {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
}

/**
 * Envia a mensagem pelo WhatsApp Cloud API. Nunca lança erro: devolve o que
 * aconteceu para ficar anotado no pedido.
 */
export async function enviarWhatsApp(env, config, tipo, p) {
  const base = { tipo, via: "api" };
  if (!p.cliente?.aceitaWhatsApp) return { ...base, situacao: "sem_consentimento" };
  if (!whatsappConfigurado(env)) return { ...base, situacao: "nao_configurado" };
  const para = telefoneWhatsApp(p.cliente.telefone);
  if (!para) return { ...base, situacao: "telefone_invalido" };
  const modelo = config?.modelos?.[tipo];
  if (!modelo) return { ...base, situacao: "nao_configurado" };
  try {
    const resp = await fetch(`https://graph.facebook.com/${config.versaoApi || "v23.0"}/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para,
        type: "template",
        template: { name: modelo, language: { code: config.idioma || "pt_BR" }, components: [{ type: "body", parameters: parametrosModelo(tipo, p) }] },
      }),
    });
    const r = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("WhatsApp recusou a mensagem", resp.status, r?.error?.message);
      return { ...base, situacao: "falhou", detalhe: String(r?.error?.message || `erro ${resp.status}`).slice(0, 200) };
    }
    return { ...base, situacao: "enviada", idMensagem: r?.messages?.[0]?.id || null };
  } catch (e) {
    return { ...base, situacao: "falhou", detalhe: "Sem conexão com o WhatsApp." };
  }
}
