// Prévia do produto personalizado que segue junto com o pedido para a loja.
// Usa a imagem final do item (guardada no navegador pelo carrinho) e monta uma
// imagem leve, com o tapete de cantos arredondados e uma legenda com o pedido.

import { lerImagem } from "./imagens.js";

const LARGURA = 1200;
const LEGENDA = 150;

async function abrirImagem(blob) {
  if ("createImageBitmap" in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function linhaCortada(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  while (texto && ctx.measureText(texto + "…").width > largura) texto = texto.slice(0, -1);
  return texto + "…";
}

/**
 * Monta a prévia de um item: a arte na proporção do produto, sem distorcer,
 * e uma legenda com o código do pedido, o produto e a personalização.
 * @returns {Promise<string>} data URL JPEG
 */
export async function gerarPrevia(blob, { codigo, numero, titulo, detalhe }) {
  const img = await abrirImagem(blob);
  const margem = 40;
  const areaL = LARGURA - margem * 2;
  const areaA = Math.round(areaL * (img.height / img.width));
  const tela = document.createElement("canvas");
  tela.width = LARGURA;
  tela.height = areaA + margem * 2 + LEGENDA;
  const ctx = tela.getContext("2d");
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(0, 0, tela.width, tela.height);

  const raio = Math.min(areaL, areaA) * 0.04;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  arredondado(ctx, margem, margem, areaL, areaA, raio);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();
  ctx.save();
  arredondado(ctx, margem, margem, areaL, areaA, raio);
  ctx.clip();
  ctx.drawImage(img, margem, margem, areaL, areaA);
  ctx.restore();
  img.close?.();

  const y = areaA + margem * 2;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, y, tela.width, LEGENDA);
  ctx.fillStyle = "#00FFCE";
  ctx.fillRect(0, y, tela.width, 6);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 38px Inter, system-ui, sans-serif";
  ctx.fillText(linhaCortada(ctx, codigo ? `Pedido ${codigo} · item ${numero}` : "Prévia do seu produto", areaL), margem, y + 26);
  ctx.font = "600 28px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#E5E7EB";
  ctx.fillText(linhaCortada(ctx, titulo, areaL), margem, y + 74);
  ctx.fillStyle = "#9CA3AF";
  ctx.font = "500 24px Inter, system-ui, sans-serif";
  ctx.fillText(linhaCortada(ctx, detalhe || "Prévia ilustrativa", areaL), margem, y + 112);

  return tela.toDataURL("image/jpeg", 0.82);
}

/**
 * Envia para a loja a prévia de cada item personalizado que ainda não foi enviado.
 * Devolve o pedido com `previaEnviada` marcado nos itens que deram certo.
 */
export async function enviarPrevias(p, descrever) {
  if (!p.chave) return p;
  const itens = [...p.itens];
  let falhou = false;
  for (const [n, item] of itens.entries()) {
    if (!item.referenciaImagem || item.previaEnviada) continue;
    try {
      const blob = await lerImagem(item.referenciaImagem);
      if (!blob) continue;
      const imagem = await gerarPrevia(blob, {
        codigo: p.codigo,
        numero: n + 1,
        titulo: `${item.produtoNome}: ${item.modeloNome}${item.dimensoes?.rotulo ? " · " + item.dimensoes.rotulo : ""} · ${item.quantidade} un.`,
        detalhe: descrever(item.personalizacao),
      });
      const resp = await fetch(`api/pedidos/${encodeURIComponent(p.codigo)}/previas/${n}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: p.chave, imagem }),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      itens[n] = { ...item, previaEnviada: true };
    } catch (e) {
      console.error("prévia não enviada", e);
      falhou = true;
    }
  }
  return { ...p, itens, previasPendentes: falhou };
}

/** Endereço da prévia de um item, para abrir no site ou mandar no WhatsApp. */
export function linkPrevia(p, n) {
  return new URL(`api/pedidos/${encodeURIComponent(p.codigo)}/previas/${n}?chave=${encodeURIComponent(p.chave)}`, location.href).href;
}
