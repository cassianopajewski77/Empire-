// Modelo de pedido e regras de status.
// Este site não tem backend: o pedido é montado no navegador e enviado pelo canal
// configurado (WhatsApp). Nada aqui confirma pagamento. A confirmação real só pode
// vir de um backend que receba o aviso (webhook) do provedor de pagamento.

import { uid } from "./util.js";

export const STATUS = {
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  em_producao: "Em produção",
  pronto_para_envio: "Pronto para envio",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// Transições permitidas entre status.
const TRANSICOES = {
  aguardando_pagamento: ["pagamento_confirmado", "cancelado"],
  pagamento_confirmado: ["em_producao", "cancelado"],
  em_producao: ["pronto_para_envio", "cancelado"],
  pronto_para_envio: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
};

/**
 * Diz se um pedido pode mudar de status.
 * "pagamento_confirmado" só é aceito quando a origem é o provedor de pagamento
 * (verificado no servidor) ou a conferência manual feita por um adulto responsável.
 * Um clique do cliente no navegador nunca é origem válida.
 */
export function podeMudarStatus(atual, novo, origem) {
  if (!TRANSICOES[atual]?.includes(novo)) return false;
  if (novo === "pagamento_confirmado") return origem === "provedor" || origem === "conferencia_manual";
  return origem !== "cliente";
}

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
    cliente: { nome: cliente.nome, telefone: cliente.telefone, email: cliente.email || null },
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
