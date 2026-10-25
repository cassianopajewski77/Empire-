// Carrinho. Cada personalização é um item próprio, com id único: dois mousepads
// do mesmo modelo com imagens diferentes nunca são somados num item só.
// Os dados ficam no localStorage deste aparelho; as imagens finais, no IndexedDB.

import { lerLocal, gravarLocal, uid } from "./util.js";
import { salvarImagem, apagarImagem } from "./imagens.js";

const CHAVE = "empire-carrinho-v1";
const QTD_MAX = 20;
const ouvintes = new Set();

export function itens() {
  const lista = lerLocal(CHAVE, []);
  return Array.isArray(lista) ? lista : [];
}

function gravar(lista) {
  if (!gravarLocal(CHAVE, lista)) throw new Error("armazenamento");
  ouvintes.forEach(fn => fn(lista));
}

export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

export function totalItens() {
  return itens().reduce((s, i) => s + i.quantidade, 0);
}

/**
 * Adiciona um item personalizado.
 * @param {object} item dados do produto, do modelo e da personalização
 * @param {Blob} imagemFinal imagem composta (área de impressão) gerada pelo personalizador
 */
export async function adicionar(item, imagemFinal) {
  const id = uid("item-");
  const chaveImagem = imagemFinal ? "img-" + id : null;
  if (imagemFinal) await salvarImagem(chaveImagem, imagemFinal);
  const novo = {
    ...item,
    id,
    chaveImagem,
    quantidade: limitar(item.quantidade),
    adicionadoEm: new Date().toISOString(),
  };
  try {
    gravar([...itens(), novo]);
  } catch (e) {
    if (chaveImagem) await apagarImagem(chaveImagem);
    throw e;
  }
  return novo;
}

export function alterarQuantidade(id, quantidade) {
  gravar(itens().map(i => (i.id === id ? { ...i, quantidade: limitar(quantidade) } : i)));
}

export async function remover(id) {
  const alvo = itens().find(i => i.id === id);
  gravar(itens().filter(i => i.id !== id));
  if (alvo?.chaveImagem) await apagarImagem(alvo.chaveImagem);
}

/** Esvazia o carrinho. Com manterImagens, as imagens continuam guardadas para o pedido. */
export async function esvaziar({ manterImagens = false } = {}) {
  const lista = itens();
  gravar([]);
  if (!manterImagens) await Promise.all(lista.filter(i => i.chaveImagem).map(i => apagarImagem(i.chaveImagem)));
}

export function limitar(q) {
  const n = Math.round(Number(q));
  return Number.isFinite(n) ? Math.min(QTD_MAX, Math.max(1, n)) : 1;
}

/** Totais. Se algum preço ainda não foi definido, o total também fica indefinido. */
export function calcularTotais(lista, entrega) {
  let subtotal = 0;
  let precoIndefinido = false;
  for (const i of lista) {
    if (typeof i.precoUnitario === "number") subtotal += i.precoUnitario * i.quantidade;
    else precoIndefinido = true;
  }
  const frete = entrega?.configurada && typeof entrega.valor === "number" ? entrega.valor : null;
  const total = precoIndefinido ? null : subtotal + (frete ?? 0);
  return { subtotal: precoIndefinido ? null : subtotal, frete, total, precoIndefinido };
}

export function subtotalItem(i) {
  return typeof i.precoUnitario === "number" ? i.precoUnitario * i.quantidade : null;
}
