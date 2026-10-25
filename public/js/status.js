// Status de pedido e transições permitidas. Usado pelo site e pelo servidor (src/).

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
export const TRANSICOES = {
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
