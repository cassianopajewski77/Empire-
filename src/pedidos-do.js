// Banco de pedidos da loja: um Durable Object com SQLite na Cloudflare.
// Existe uma única instância ("loja"), então cada operação acontece uma de cada
// vez. Isso garante, por exemplo, que o aviso de "pagamento confirmado" saia uma
// vez só, mesmo que o Mercado Pago avise e o cliente consulte ao mesmo tempo.

import { DurableObject } from "cloudflare:workers";
import { podeMudarStatus } from "../public/js/status.js";

const BLOQUEIO_MS = 15 * 60 * 1000;
const FALHAS_MAX = 10;

export class Pedidos extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pedidos (
        codigo TEXT PRIMARY KEY,
        criado_em TEXT NOT NULL,
        status TEXT NOT NULL,
        dados TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pedidos_criado ON pedidos (criado_em);
      CREATE TABLE IF NOT EXISTS falhas_login (em INTEGER NOT NULL);
    `);
  }

  #ler(codigo) {
    const linha = this.sql.exec("SELECT dados FROM pedidos WHERE codigo = ?", codigo).toArray()[0];
    return linha ? JSON.parse(linha.dados) : null;
  }

  #gravar(p) {
    p.atualizadoEm = new Date().toISOString();
    this.sql.exec("UPDATE pedidos SET status = ?, dados = ? WHERE codigo = ?", p.status, JSON.stringify(p), p.codigo);
    return p;
  }

  #historico(p, texto) {
    (p.historico ||= []).push({ em: new Date().toISOString(), texto });
  }

  /** Grava um pedido novo. Devolve null se o código já existir. */
  criar(pedido) {
    if (this.#ler(pedido.codigo)) return null;
    const p = { ...pedido, status: "aguardando_pagamento", historico: [], notificacoes: [] };
    this.#historico(p, "Pedido recebido pelo site.");
    this.sql.exec("INSERT INTO pedidos (codigo, criado_em, status, dados) VALUES (?, ?, ?, ?)", p.codigo, p.criadoEm, p.status, JSON.stringify(p));
    return p;
  }

  obter(codigo) {
    return this.#ler(codigo);
  }

  listar(limite = 200) {
    return this.sql.exec("SELECT dados FROM pedidos ORDER BY criado_em DESC LIMIT ?", limite).toArray().map(l => JSON.parse(l.dados));
  }

  /** Guarda a cobrança Pix criada no Mercado Pago. */
  registrarPix(codigo, pix) {
    const p = this.#ler(codigo);
    if (!p) return null;
    p.pagamento = { ...p.pagamento, mercadoPago: pix };
    return this.#gravar(p);
  }

  /**
   * Marca o pedido como pago. `mudou` só é true na primeira vez, para o aviso
   * ao cliente sair uma única vez.
   */
  confirmarPagamento(codigo, info, origem) {
    const p = this.#ler(codigo);
    if (!p) return { erro: "nao_encontrado" };
    if (p.pagamento?.confirmado) return { mudou: false, pedido: p };
    if (!podeMudarStatus(p.status, "pagamento_confirmado", origem)) return { erro: "status_invalido", pedido: p };
    p.status = "pagamento_confirmado";
    p.pagamento = { ...p.pagamento, confirmado: true, confirmadoPor: origem, aprovadoEm: info.aprovadoEm || new Date().toISOString() };
    if (info.mercadoPago) p.pagamento.mercadoPago = { ...p.pagamento.mercadoPago, ...info.mercadoPago };
    this.#historico(p, origem === "provedor" ? `Pagamento aprovado pelo Mercado Pago (Pix nº ${info.mercadoPago?.id}).` : "Pagamento conferido manualmente pela loja.");
    return { mudou: true, pedido: this.#gravar(p) };
  }

  /** Mudança de status feita pela loja no painel. */
  mudarStatus(codigo, novo) {
    const p = this.#ler(codigo);
    if (!p) return { erro: "nao_encontrado" };
    if (novo === "pagamento_confirmado") return this.confirmarPagamento(codigo, {}, "conferencia_manual");
    if (!podeMudarStatus(p.status, novo, "loja")) return { erro: "status_invalido", pedido: p };
    const anterior = p.status;
    p.status = novo;
    this.#historico(p, `Status alterado de "${anterior}" para "${novo}" pela loja.`);
    return { mudou: true, pedido: this.#gravar(p) };
  }

  /** Salva o rastreio e marca o pedido como enviado. Pode ser corrigido depois. */
  salvarRastreio(codigo, rastreio) {
    const p = this.#ler(codigo);
    if (!p) return { erro: "nao_encontrado" };
    if (!["pagamento_confirmado", "em_producao", "pronto_para_envio", "enviado"].includes(p.status)) return { erro: "status_invalido", pedido: p };
    const correcao = p.status === "enviado";
    p.rastreio = { ...rastreio, em: new Date().toISOString() };
    p.status = "enviado";
    this.#historico(p, `${correcao ? "Rastreio corrigido" : "Pedido enviado"}: ${rastreio.transportadora} ${rastreio.codigo}.`);
    return { mudou: true, pedido: this.#gravar(p) };
  }

  /** Anota o resultado de uma mensagem de WhatsApp para o cliente. */
  registrarNotificacao(codigo, notificacao) {
    const p = this.#ler(codigo);
    if (!p) return null;
    (p.notificacoes ||= []).push({ ...notificacao, em: new Date().toISOString() });
    return this.#gravar(p);
  }

  /** Limita tentativas de senha do painel: no máximo 10 erros a cada 15 minutos. */
  loginBloqueado() {
    const desde = Date.now() - BLOQUEIO_MS;
    this.sql.exec("DELETE FROM falhas_login WHERE em < ?", desde);
    return this.sql.exec("SELECT COUNT(*) AS n FROM falhas_login").toArray()[0].n >= FALHAS_MAX;
  }

  registrarFalhaLogin() {
    this.sql.exec("INSERT INTO falhas_login (em) VALUES (?)", Date.now());
  }
}
