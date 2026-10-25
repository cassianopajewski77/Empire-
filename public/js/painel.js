// Painel da loja: lista os pedidos, muda o status, lança o rastreio e
// acompanha as mensagens de WhatsApp. Tudo passa pelo servidor (/api/admin),
// que confere a senha (segredo ADMIN_SENHA na Cloudflare) a cada pedido.

import { brl, esc, avisar } from "./util.js";
import { STATUS, TRANSICOES } from "./status.js";

const main = document.getElementById("conteudo");
const botaoSair = document.querySelector("[data-sair]");
const CHAVE_SENHA = "empire-painel";
let config = null;
let filtro = "";

const lerSenha = () => { try { return sessionStorage.getItem(CHAVE_SENHA) || ""; } catch { return ""; } };
const gravarSenha = s => { try { s ? sessionStorage.setItem(CHAVE_SENHA, s) : sessionStorage.removeItem(CHAVE_SENHA); } catch { /* opcional */ } };

async function api(caminho, { metodo = "GET", corpo } = {}) {
  const resp = await fetch("api/admin" + caminho, {
    method: metodo,
    // a senha vai codificada para aceitar acentos e "ç" no cabeçalho HTTP
    headers: { Authorization: `Bearer ${encodeURIComponent(lerSenha())}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const dados = await resp.json().catch(() => ({}));
  if (resp.status === 401) { gravarSenha(""); telaLogin("Senha incorreta."); throw new Error("sem acesso"); }
  if (!resp.ok) { const e = new Error(dados.erro || "Algo deu errado."); e.status = resp.status; e.dados = dados; throw e; }
  return dados;
}

const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const chip = p => `<span class="status-pedido ${p.status === "cancelado" ? "cancelado" : p.pago || p.pagamento?.confirmado ? "pago" : ""}">${esc(STATUS[p.status] || p.status)}</span>`;

function telaLogin(erro = "") {
  botaoSair.hidden = true;
  document.title = "Painel da loja | Mats & Mouse Pads Empire";
  main.innerHTML = `
    <form class="painel-login form" data-login novalidate>
      <h1>Entrar no painel</h1>
      <div class="campo"><label for="senha">Senha da loja</label><input id="senha" type="password" autocomplete="current-password" required aria-describedby="erro-senha"><div class="erro" id="erro-senha">${esc(erro)}</div></div>
      <button class="btn btn-primario" type="submit">Entrar</button>
      <p class="aviso aviso-info"><strong>Acesso só da loja.</strong>A senha é o segredo ADMIN_SENHA cadastrado na Cloudflare.</p>
    </form>`;
  const form = main.querySelector("[data-login]");
  form.senha.focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const senha = form.senha.value;
    if (!senha) { form.querySelector("#erro-senha").textContent = "Digite a senha."; return; }
    gravarSenha(senha);
    try { config = await api("/config"); rotear(); }
    catch (err) { if (err.message !== "sem acesso") form.querySelector("#erro-senha").textContent = err.message; }
  });
}

function avisoConfig() {
  if (!config) return "";
  const faltando = [];
  if (!config.whatsappAutomatico) faltando.push("O envio automático pelo WhatsApp ainda não está ligado (segredos WHATSAPP_TOKEN e WHATSAPP_PHONE_ID). Use o botão Abrir no WhatsApp em cada pedido.");
  if (!config.mercadoPago) faltando.push("O Mercado Pago ainda não está ligado (segredo MP_ACCESS_TOKEN).");
  return faltando.length ? `<div class="aviso aviso-info" style="margin-bottom:16px">${faltando.map(f => `<p style="margin:0">${f}</p>`).join("")}</div>` : "";
}

async function telaLista() {
  document.title = "Pedidos | Painel da loja";
  main.innerHTML = `<p>Carregando pedidos…</p>`;
  const pedidos = await api("/pedidos");
  const lista = filtro ? pedidos.filter(p => p.status === filtro) : pedidos;
  main.innerHTML = `
    <div class="painel-barra">
      <h1>Pedidos</h1>
      <label class="pular" for="filtro">Filtrar por status</label>
      <select id="filtro" data-filtro>
        <option value="">Todos (${pedidos.length})</option>
        ${Object.entries(STATUS).map(([id, nome]) => `<option value="${id}" ${id === filtro ? "selected" : ""}>${esc(nome)} (${pedidos.filter(p => p.status === id).length})</option>`).join("")}
      </select>
      <button type="button" class="btn btn-contorno" data-atualizar>Atualizar</button>
    </div>
    ${avisoConfig()}
    ${lista.length ? `<ul class="painel-lista">${lista.map(p => `
      <li><a href="#${esc(p.codigo)}" data-pedido="${esc(p.codigo)}">
        <span><strong>${esc(p.codigo)}</strong> · ${esc(p.nome)}<br><span class="meta">${esc(dataHora(p.criadoEm))}${p.rastreio ? ` · rastreio ${esc(p.rastreio)}` : ""}</span></span>
        <span class="direita">${chip(p)}<br><span class="meta">${brl(p.total, "A definir")}</span></span>
      </a></li>`).join("")}</ul>` : `<p>Nenhum pedido ${filtro ? "com esse status" : "ainda"}.</p>`}`;
  main.querySelector("[data-filtro]").addEventListener("change", e => { filtro = e.target.value; telaLista(); });
  main.querySelector("[data-atualizar]").addEventListener("click", () => telaLista());
}

const SITUACAO = {
  enviada: "enviada automaticamente ✓",
  falhou: "o envio automático falhou",
  nao_configurado: "envio automático desligado",
  sem_consentimento: "cliente não pediu avisos pelo WhatsApp",
  telefone_invalido: "telefone do cliente inválido",
};

function caixaMensagem(p, tipo, titulo) {
  const m = p.mensagens?.[tipo];
  if (!m) return "";
  const ultima = [...(p.notificacoes || [])].reverse().find(n => n.tipo === tipo);
  return `
    <div class="painel-caixa" data-mensagem="${tipo}">
      <h2>${titulo}</h2>
      ${ultima ? `<p>Última tentativa (${esc(dataHora(ultima.em))}): <strong>${esc(SITUACAO[ultima.situacao] || ultima.situacao)}</strong>${ultima.detalhe ? `<br><small>${esc(ultima.detalhe)}</small>` : ""}</p>` : ""}
      <details><summary>Ver texto da mensagem</summary><div class="painel-msg">${esc(m.texto)}</div></details>
      <div class="painel-acoes" style="margin-top:10px">
        ${m.link ? `<a class="btn btn-primario" href="${esc(m.link)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : `<span class="aviso aviso-alerta">Telefone do cliente inválido.</span>`}
        ${config?.whatsappAutomatico && p.cliente.aceitaWhatsApp ? `<button type="button" class="btn btn-contorno" data-reenviar="${tipo}">Reenviar automática</button>` : ""}
      </div>
    </div>`;
}

const NOMES_ACAO = {
  pagamento_confirmado: "Confirmar pagamento (conferi o Pix)",
  em_producao: "Começar produção",
  pronto_para_envio: "Pronto para envio",
  entregue: "Marcar como entregue",
  cancelado: "Cancelar pedido",
};

/** As prévias precisam da senha, então são baixadas aqui e mostradas como blob. */
async function carregarPrevias(codigo) {
  for (const img of main.querySelectorAll("[data-previa-img]")) {
    const n = img.dataset.previaImg;
    try {
      const resp = await fetch(`api/admin/pedidos/${encodeURIComponent(codigo)}/previas/${n}`, { headers: { Authorization: `Bearer ${encodeURIComponent(lerSenha())}` }, cache: "no-store" });
      if (!resp.ok) throw new Error(String(resp.status));
      const url = URL.createObjectURL(await resp.blob());
      img.src = url;
      main.querySelector(`[data-previa-link="${n}"]`).href = url;
    } catch {
      img.replaceWith(Object.assign(document.createElement("span"), { textContent: "Não foi possível carregar a prévia." }));
    }
  }
}

async function telaPedido(codigo) {
  document.title = `${codigo} | Painel da loja`;
  main.innerHTML = `<p>Carregando pedido…</p>`;
  let p;
  try { p = await api(`/pedidos/${encodeURIComponent(codigo)}`); }
  catch (e) { if (e.status === 404) { main.innerHTML = `<p>Pedido não encontrado.</p><a class="btn btn-escuro" href="#">Voltar</a>`; return; } throw e; }
  const e = p.endereco;
  const proximos = (TRANSICOES[p.status] || []).filter(s => s !== "enviado");
  const podeRastrear = ["pagamento_confirmado", "em_producao", "pronto_para_envio", "enviado"].includes(p.status);
  const tel = String(p.cliente.telefone || "").replace(/\D/g, "");
  main.innerHTML = `
    <div class="painel-barra">
      <a class="btn btn-texto" href="#">← Pedidos</a>
      <h1>${esc(p.codigo)}</h1>
      ${chip(p)}
    </div>
    <div class="painel-detalhe">
      <div>
        <div class="painel-caixa">
          <h2>Cliente</h2>
          <p style="margin:0">${esc(p.cliente.nome)}<br>
            <a href="tel:+55${esc(tel)}">${esc(p.cliente.telefone)}</a>${p.cliente.email ? ` · ${esc(p.cliente.email)}` : ""}<br>
            ${p.cliente.aceitaWhatsApp ? "Aceitou avisos pelo WhatsApp." : "<strong>Não</strong> pediu avisos pelo WhatsApp."}</p>
          <p style="margin:10px 0 0">${esc(e.rua)}, ${esc(e.numero)}${e.complemento ? " · " + esc(e.complemento) : ""}<br>${esc(e.bairro)} · ${esc(e.cidade)}/${esc(e.estado)} · CEP ${esc(e.cep)}</p>
          ${p.observacoes ? `<p style="margin:10px 0 0"><strong>Observações:</strong> ${esc(p.observacoes)}</p>` : ""}
        </div>
        <div class="painel-caixa">
          <h2>Produtos</h2>
          <div class="rolagem-x"><table class="tabela-resumo">
            <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Unitário</th></tr></thead>
            <tbody>${p.itens.map(i => `<tr><td><strong>${esc(i.produtoNome)}: ${esc(i.modeloNome)}</strong><br><small>${esc(i.dimensoes?.rotulo || "")}${i.personalizacaoTexto ? " · " + esc(i.personalizacaoTexto) : ""}</small></td><td class="num">${i.quantidade}</td><td class="num">${brl(i.precoUnitario, "A definir")}</td></tr>`).join("")}</tbody>
          </table></div>
          <p style="margin:10px 0 0"><strong>Total: ${brl(p.valores.total, "a definir")}</strong> · Entrega: ${esc(p.valores.frete != null ? brl(p.valores.frete) : p.valores.entregaMensagem)}</p>
          ${p.itens.some(i => i.previa) ? `<h3 style="font-size:1rem;margin:16px 0 8px">Prévias anexadas ao pedido</h3><div class="previas-pedido">${p.itens.map((i, n) => i.previa ? `<figure><a data-previa-link="${n}" download="${esc(p.codigo)}-item${n + 1}.jpg"><img data-previa-img="${n}" alt="Prévia do item ${n + 1}: ${esc(i.produtoNome)}, ${esc(i.modeloNome)}"></a><figcaption>Item ${n + 1}: ${esc(i.modeloNome)} · toque para baixar</figcaption></figure>` : "").join("")}</div>` : ""}
          ${p.itens.some(i => i.fonte === "upload" && !i.previa) ? `<p class="aviso aviso-info" style="margin-top:10px"><strong>Imagens do cliente</strong>A prévia deste item não chegou pelo site. As imagens do cliente chegam pela conversa do WhatsApp da loja.</p>` : ""}
        </div>
        <div class="painel-caixa">
          <h2>Pagamento</h2>
          <p style="margin:0">${p.pagamento.confirmado
            ? `Confirmado ${p.pagamento.confirmadoPor === "provedor" ? "pelo Mercado Pago" : "pela loja (conferência manual)"} em ${esc(dataHora(p.pagamento.aprovadoEm))}.`
            : "Ainda não confirmado."}
            ${p.pagamento.mercadoPago?.id ? `<br>Pix Mercado Pago nº ${esc(p.pagamento.mercadoPago.id)}` : ""}</p>
        </div>
        <div class="painel-caixa">
          <h2>Histórico</h2>
          <ol class="painel-historico">${(p.historico || []).map(h => `<li>${esc(dataHora(h.em))}: ${esc(h.texto)}</li>`).join("")}</ol>
        </div>
      </div>
      <div>
        <div class="painel-caixa">
          <h2>Status</h2>
          ${proximos.length ? `<div class="painel-acoes">${proximos.map(s => `<button type="button" class="btn ${s === "cancelado" ? "btn-contorno" : "btn-escuro"}" data-status="${s}">${esc(NOMES_ACAO[s] || STATUS[s])}</button>`).join("")}</div>` : `<p style="margin:0">Nenhuma mudança de status disponível.</p>`}
          ${p.status === "aguardando_pagamento" ? `<p style="font-size:.85rem;color:var(--color-muted)">Pix pelo Mercado Pago é confirmado sozinho. Use "Confirmar pagamento" só depois de conferir um Pix combinado pelo WhatsApp no app do banco.</p>` : ""}
        </div>
        ${podeRastrear ? `
        <form class="painel-caixa form" data-rastreio novalidate>
          <h2>${p.rastreio ? "Rastreio da entrega" : "Lançar rastreio e avisar o cliente"}</h2>
          <div class="campo"><label for="transportadora">Transportadora</label><input id="transportadora" name="transportadora" list="transportadoras" maxlength="60" required value="${esc(p.rastreio?.transportadora || "")}">
            <datalist id="transportadoras"><option>Correios</option><option>Jadlog</option><option>Loggi</option><option>Entrega própria</option></datalist></div>
          <div class="campo"><label for="codigo">Código de rastreio</label><input id="codigo" name="codigo" maxlength="60" required value="${esc(p.rastreio?.codigo || "")}" autocapitalize="characters"></div>
          <div class="campo"><label for="link">Link para acompanhar <span class="opcional">(opcional)</span></label><input id="link" name="link" type="url" inputmode="url" maxlength="300" placeholder="https://" value="${esc(p.rastreio?.link || "")}"></div>
          <p class="msg-campo" data-erro-rastreio role="alert"></p>
          <button class="btn btn-primario" type="submit">${p.rastreio ? "Corrigir rastreio e avisar de novo" : "Salvar rastreio e avisar o cliente"}</button>
        </form>` : ""}
        ${caixaMensagem(p, "pago", "Mensagem: pedido pago")}
        ${caixaMensagem(p, "enviado", "Mensagem: pedido enviado")}
      </div>
    </div>`;

  main.querySelectorAll("[data-status]").forEach(b => b.addEventListener("click", async () => {
    const novo = b.dataset.status;
    if (novo === "cancelado" && !confirm(`Cancelar o pedido ${p.codigo}? Isso não pode ser desfeito.`)) return;
    if (novo === "pagamento_confirmado" && !confirm("Você conferiu no app do banco que o Pix deste pedido caiu?")) return;
    b.disabled = true;
    try { await api(`/pedidos/${p.codigo}/status`, { metodo: "POST", corpo: { status: novo } }); avisar(`Status: ${STATUS[novo]}.`); }
    catch (err) { avisar(err.message); }
    telaPedido(p.codigo);
  }));
  carregarPrevias(p.codigo);
  main.querySelector("[data-rastreio]")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target;
    const dados = Object.fromEntries(new FormData(f));
    const erro = f.querySelector("[data-erro-rastreio]");
    if (!dados.transportadora.trim() || !dados.codigo.trim()) { erro.textContent = "Preencha a transportadora e o código de rastreio."; return; }
    f.querySelector("button").disabled = true;
    try {
      const r = await api(`/pedidos/${p.codigo}/rastreio`, { metodo: "POST", corpo: dados });
      const n = [...r.notificacoes].reverse().find(x => x.tipo === "enviado");
      avisar(n?.situacao === "enviada" ? "Rastreio salvo e cliente avisado pelo WhatsApp." : "Rastreio salvo. Toque em Abrir no WhatsApp para avisar o cliente.");
      telaPedido(p.codigo);
    } catch (err) { erro.textContent = err.message; f.querySelector("button").disabled = false; }
  });
  main.querySelectorAll("[data-reenviar]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const r = await api(`/pedidos/${p.codigo}/notificar`, { metodo: "POST", corpo: { tipo: b.dataset.reenviar } });
      const n = r.notificacoes.at(-1);
      avisar(n.situacao === "enviada" ? "Mensagem enviada." : `Não enviada: ${SITUACAO[n.situacao] || n.situacao}.`);
    } catch (err) { avisar(err.message); }
    telaPedido(p.codigo);
  }));
}

async function rotear() {
  if (!lerSenha()) return telaLogin();
  botaoSair.hidden = false;
  try {
    if (!config) config = await api("/config");
    const codigo = decodeURIComponent(location.hash.slice(1));
    if (/^EMP-[A-Z0-9]{6}$/.test(codigo)) await telaPedido(codigo);
    else await telaLista();
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.message === "sem acesso") return;
    main.innerHTML = `<p class="aviso aviso-alerta"><strong>Não foi possível abrir o painel.</strong>${esc(e.message)}</p><p><button type="button" class="btn btn-escuro" data-tentar>Tentar de novo</button></p>`;
    main.querySelector("[data-tentar]").addEventListener("click", rotear);
  }
}

botaoSair.addEventListener("click", () => { gravarSenha(""); config = null; location.hash = ""; telaLogin(); });
window.addEventListener("hashchange", rotear);
rotear();
