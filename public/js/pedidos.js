// Modelo de pedido e regras de status.
// O pedido é montado no navegador e registrado no servidor da loja (src/worker.js),
// que recalcula os preços. Nada aqui confirma pagamento: a confirmação vem do
// servidor, depois de consultar o Mercado Pago, ou da conferência manual no painel.

import { uid } from "./util.js";

export { STATUS, TRANSICOES, podeMudarStatus } from "./status.js";

/** Gera um código curto e legível para o pedido, ex.: EMP-7K3Q9X. */
export function codigoPedido() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint8Array(6));
  return "EMP-" + Array.from(r, n => letras[n % letras.length]).join("");
}

/**
 * Monta o pedido a partir do carrinho e dos dados do cliente.
 * Os preços são copiados neste momento e não mudam se o catálogo mudar depois.
 */
export function montarPedido({ itens, cliente, endereco, observacoes, totais, loja }) {
  return {
    id: uid("ped-"),
    codigo: codigoPedido(),
    criadoEm: new Date().toISOString(),
    status: "aguardando_pagamento",
    cliente: { nome: cliente.nome, telefone: cliente.telefone, email: cliente.email || null, aceitaWhatsApp: Boolean(cliente.aceitaWhatsApp) },
    endereco: { ...endereco },
    observacoes: observacoes || null,
    itens: itens.map(i => ({
      itemId: i.id,
      produtoId: i.produtoId,
      produtoNome: i.produtoNome,
      modeloId: i.modeloId,
      modeloNome: i.modeloNome,
      dimensoes: i.dimensoes,
      quantidade: i.quantidade,
      precoUnitario: typeof i.precoUnitario === "number" ? i.precoUnitario : null,
      personalizacao: i.personalizacao,
      // Referência à imagem de produção. Hoje ela só existe neste navegador;
      // num backend real, seria o caminho do arquivo privado no armazenamento.
      referenciaImagem: i.chaveImagem,
    })),
    valores: {
      subtotal: totais.subtotal,
      frete: totais.frete,
      total: totais.total,
      precoAConfirmar: totais.precoIndefinido,
      entregaMensagem: loja.entrega?.configurada ? null : loja.entrega?.mensagem || "Entrega a combinar.",
    },
    pagamento: {
      metodo: "pix",
      modo: loja.pagamento?.modo || "demonstracao",
      confirmado: false,
    },
  };
}
