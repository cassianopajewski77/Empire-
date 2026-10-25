// Mats & Mouse Pads Empire — rotas e páginas.
import { brl, esc, avisar, DISPONIBILIDADE } from "./util.js";
import { carregarDados, produtosPublicados, acharProduto, acharModelo, artesPublicadas, podeComprar } from "./dados.js";
import * as carrinho from "./carrinho.js";
import { Personalizador, carregarImagem } from "./personalizador.js";
import { montarPedido, STATUS } from "./pedidos.js";
import { lerImagem, apagarImagem } from "./imagens.js";
import { buscarCep, mascaraCep } from "./cep.js";

const main = document.getElementById("conteudo");
let dados;
let personalizadorAtivo = null;

// ---------------------------------------------------------------- utilidades de página
function titulo(t) { document.title = t ? `${t} | Mats & Mouse Pads Empire` : "Mats & Mouse Pads Empire"; }

function atualizarContador() {
  const n = carrinho.totalItens();
  document.querySelectorAll("[data-contador]").forEach(el => {
    el.textContent = n;
    el.setAttribute("aria-label", `${n} ${n === 1 ? "item" : "itens"} no carrinho`);
  });
}

function marcarMenu(rota) {
  document.querySelectorAll("#menu a").forEach(a => {
    const alvo = a.getAttribute("href").slice(1);
    const ativo = alvo === "/" ? rota === "/" : rota.startsWith(alvo);
    if (ativo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function precoAtual(item) {
  const p = acharProduto(dados.catalogo, item.produtoId);
  const m = acharModelo(p, item.modeloId);
  return m && typeof m.preco === "number" ? m.preco : null;
}

/** No carrinho, o preço acompanha o catálogo. No pedido, ele é congelado. */
function itensComPrecoAtual() {
  return carrinho.itens().map(i => ({ ...i, precoUnitario: precoAtual(i) }));
}

function descricaoPersonalizacao(p) {
  if (!p) return "";
  if (p.fonte === "arte" && p.arte) return `Arte da loja: ${p.arte.nome}`;
  if (p.fonte === "upload" && p.arquivo) return `Imagem enviada: ${p.arquivo.nome}`;
  return "";
}

const iconePet = `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><ellipse cx="32" cy="42" rx="14" ry="11"/><ellipse cx="16" cy="28" rx="6" ry="8"/><ellipse cx="48" cy="28" rx="6" ry="8"/><ellipse cx="25" cy="17" rx="5.5" ry="7.5"/><ellipse cx="39" cy="17" rx="5.5" ry="7.5"/></svg>`;

function midiaModelo(produto, modelo, indice = 0) {
  if (modelo.imagens?.length) {
    return `<img src="${esc(modelo.imagens[0])}" alt="${esc(modelo.nome)}" loading="lazy">`;
  }
  if (produto.personalizacao.permiteArtes) {
    const artes = artesPublicadas(dados.catalogo);
    const arte = artes[indice % (artes.length || 1)];
    if (arte) return `<img src="${esc(arte.imagem)}" alt="Exemplo de mousepad com a arte ${esc(arte.nome)}" loading="lazy">`;
  }
  return `<div class="placeholder-midia">${iconePet}<span>Imagem de referência em breve</span></div>`;
}

function cartaoModelo(produto, modelo, rotaPersonalizar) {
  const indice = produto.modelos.indexOf(modelo);
  const disp = DISPONIBILIDADE[modelo.disponibilidade] || "";
  const comprar = podeComprar(modelo);
  return `
    <article class="cartao">
      <div class="midia">${midiaModelo(produto, modelo, indice)}</div>
      <div class="corpo">
        <span class="etiqueta">${esc(modelo.dimensoes?.rotulo || "")}</span>
        <h3>${esc(modelo.nome)}</h3>
        <p>${esc(modelo.descricao || "Descrição em breve.")}</p>
        <p><small>${esc(disp)}</small></p>
        <span class="preco">${brl(modelo.preco)}</span>
        ${comprar
          ? `<a class="btn btn-primario btn-bloco" href="${rotaPersonalizar}">Personalizar</a>`
          : `<span class="btn btn-contorno btn-bloco" aria-disabled="true">Indisponível no momento</span>`}
      </div>
    </article>`;
}

// ---------------------------------------------------------------- páginas
function paginaInicio() {
  titulo("");
  const artes = artesPublicadas(dados.catalogo);
  const produtos = produtosPublicados(dados.catalogo);
  const destaques = produtos.flatMap(p => p.modelos.slice(0, 2).map(m => cartaoModelo(p, m, `#/personalizar/${p.id}/${m.id}`)));
  main.innerHTML = `
    <section class="banner secao-escura">
      <div class="wrap">
        <div>
          <img class="logo-grande" src="assets/logo.jpg" alt="Mats & Mouse Pads Empire" width="1000" height="318">
          <p class="sobretitulo">Produtos personalizados</p>
          <h1>Sua ideia. Sua imagem. <span class="destaque">Seu produto.</span></h1>
          <p class="lead">Crie mousepads com a sua personalidade e personalize tapetes com a foto do seu melhor amigo.</p>
          <div class="acoes">
            <a class="btn btn-primario" href="#/mousepads">Ver mousepads</a>
            <a class="btn btn-contorno" href="#/tapetes-pet">Ver tapetes pet</a>
          </div>
        </div>
        <div class="vitrine" aria-hidden="true">
          ${artes.slice(0, 4).map(a => `<img src="${esc(a.imagem)}" alt="" width="450" height="300">`).join("")}
        </div>
      </div>
    </section>

    <section class="secao secao-cinza">
      <div class="wrap">
        <p class="sobretitulo">Destaques</p>
        <h2>Escolha e <span class="destaque">personalize</span></h2>
        ${destaques.length ? `<div class="grade">${destaques.join("")}</div>` : `<div class="vazio"><p>Nenhum produto cadastrado no momento.</p></div>`}
      </div>
    </section>

    <section class="secao" id="como">
      <div class="wrap">
        <p class="sobretitulo">Como funciona</p>
        <h2>Do seu celular para a sua mesa</h2>
        ${passosHTML()}
      </div>
    </section>

    <section class="secao secao-escura">
      <div class="wrap grade-2">
        ${dados.catalogo.categorias.map(c => `
          <div>
            <h2>${esc(c.nome)}</h2>
            <p>${esc(c.descricao)}</p>
            <a class="btn btn-primario" href="${esc(c.rota)}">Conhecer</a>
          </div>`).join("")}
      </div>
    </section>

    <section class="secao secao-cinza">
      <div class="wrap" style="text-align:center">
        <h2>Pronto para criar o seu?</h2>
        <p>Escolha o produto, coloque a sua imagem e veja a prévia antes de comprar.</p>
        <a class="btn btn-escuro" href="#/catalogo">Começar a personalizar</a>
      </div>
    </section>`;
}

function passosHTML() {
  return `<ol class="passos">
    <li><h3>Escolha o produto</h3><p>Mousepad ou tapete pet, no modelo que preferir.</p></li>
    <li><h3>Coloque a imagem</h3><p>Use uma arte da loja ou envie a sua. No tapete pet, a foto do seu cão ou gato.</p></li>
    <li><h3>Ajuste e confira</h3><p>Aumente, mova e enquadre a imagem vendo a prévia no formato do produto.</p></li>
    <li><h3>Finalize o pedido</h3><p>Informe o endereço de entrega e confira o resumo antes de confirmar.</p></li>
  </ol>`;
}

function paginaComoFunciona() {
  titulo("Como funciona");
  main.innerHTML = `
    <div class="wrap cabecalho-pagina"><h1>Como funciona</h1></div>
    <div class="wrap texto-longo">${passosHTML()}
      <h2>Entrega</h2><p>${esc(dados.loja.entrega.configurada ? "Frete calculado no checkout." : dados.loja.entrega.mensagem)}</p>
      <h2>Pagamento</h2><p>${esc(textoPagamentoCurto())}</p>
    </div>`;
}

function paginaCatalogo() {
  titulo("Catálogo");
  const produtos = produtosPublicados(dados.catalogo);
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <h1>Catálogo</h1>
      <p>Todos os produtos são personalizados para você.</p>
    </div>
    <div class="wrap" style="padding-bottom:48px">
      ${produtos.length ? produtos.map(p => {
        const cat = dados.catalogo.categorias.find(c => c.id === p.categoria);
        return `<section style="margin-bottom:40px">
          <h2>${esc(cat?.nome || p.nome)}</h2>
          <p style="color:var(--color-muted)">${esc(cat?.descricao || p.descricao)}</p>
          <div class="grade">${p.modelos.map(m => cartaoModelo(p, m, `#/personalizar/${p.id}/${m.id}`)).join("")}</div>
        </section>`;
      }).join("") : `<div class="vazio"><h2>Nenhum produto cadastrado</h2><p>Volte em breve.</p></div>`}
    </div>`;
}

function paginaCategoria(produtoId) {
  const p = acharProduto(dados.catalogo, produtoId);
  const pet = produtoId === "tapete-pet";
  titulo(pet ? "Tapetes pet" : "Mousepads");
  if (!p) {
    main.innerHTML = `<div class="wrap vazio"><h1>Nenhum produto cadastrado</h1><p>Esta categoria ainda não tem produtos.</p><a class="btn btn-escuro" href="#/catalogo">Ver catálogo</a></div>`;
    return;
  }
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <nav class="migalhas" aria-label="Você está em"><a href="#/catalogo">Catálogo</a> / ${pet ? "Tapetes pet" : "Mousepads"}</nav>
      <h1>${pet ? "Tapetes pet personalizados" : "Mousepads personalizados"}</h1>
      ${pet ? `
        <p>Tapete exclusivo para <strong>cães e gatos</strong>, personalizado com a foto do seu animal.</p>
        <p><span class="etiqueta">Tamanho único: 40 × 60 cm</span></p>
        <p class="aviso aviso-info" style="max-width:40em">Para personalizar, você vai precisar de uma foto do seu cão ou gato. Fotos nítidas e bem iluminadas dão o melhor resultado.</p>`
      : `<p>Escolha o tamanho, use uma das artes da loja ou envie a sua imagem: jogos, fotos, paisagens, pets, ilustrações ou arte abstrata.</p>`}
    </div>
    <div class="wrap" style="padding-bottom:48px">
      <h2 class="sr-only">Modelos</h2>
      <div class="grade">${p.modelos.map(m => cartaoModelo(p, m, `#/personalizar/${p.id}/${m.id}`)).join("")}</div>
    </div>`;
}

async function paginaPersonalizar(produtoId, modeloId) {
  const p = acharProduto(dados.catalogo, produtoId);
  const m = acharModelo(p, modeloId);
  if (!p || !m) {
    titulo("Produto não encontrado");
    main.innerHTML = `<div class="wrap vazio"><h1>Produto não encontrado</h1><p>Este produto não existe ou não está disponível.</p><a class="btn btn-escuro" href="#/catalogo">Ver catálogo</a></div>`;
    return;
  }
  const pet = p.personalizacao.tipo === "upload_obrigatorio";
  titulo(`Personalizar ${m.nome}`);
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <nav class="migalhas" aria-label="Você está em"><a href="#/catalogo">Catálogo</a> / <a href="${pet ? "#/tapetes-pet" : "#/mousepads"}">${pet ? "Tapetes pet" : "Mousepads"}</a> / ${esc(m.nome)}</nav>
      <h1>${esc(pet ? `Tapete pet: ${m.nome}` : m.nome)}</h1>
      <p>${esc(m.descricao || p.descricao)} <strong>${esc(m.dimensoes.rotulo)}</strong>.</p>
    </div>
    <div class="wrap personalizador">
      <div class="previa-col" data-previa></div>
      <div class="controles">
        ${p.modelos.length > 1 ? `
        <fieldset class="grupo">
          <legend>${pet ? "Modelo" : "Tamanho"}</legend>
          <div class="opcoes">${p.modelos.map(x => `
            <label class="opcao"><input type="radio" name="modelo" value="${esc(x.id)}" ${x.id === m.id ? "checked" : ""} ${podeComprar(x) ? "" : "disabled"}>
              <strong>${esc(x.nome)}</strong><small>${esc(x.dimensoes.rotulo)} · ${brl(x.preco)}</small></label>`).join("")}</div>
        </fieldset>` : ""}
        ${pet ? `<p class="aviso aviso-info"><strong>Somente para cães e gatos.</strong>A foto do seu animal é obrigatória. Não há artes prontas para este produto.</p>` : ""}
        <div data-controles class="controles"></div>
        <div class="resumo-produto">
          <div>
            <span class="rotulo" id="rot-qtd">Quantidade</span>
            <div class="quantidade" role="group" aria-labelledby="rot-qtd">
              <button type="button" data-qtd="-1" aria-label="Diminuir quantidade">−</button>
              <input type="number" min="1" max="20" value="1" inputmode="numeric" aria-label="Quantidade" data-quantidade>
              <button type="button" data-qtd="1" aria-label="Aumentar quantidade">+</button>
            </div>
          </div>
          <div class="linha-preco"><span>Preço unitário</span><strong>${brl(m.preco)}</strong></div>
          ${typeof m.preco !== "number" ? `<p class="aviso">O preço deste produto ainda será definido pela loja. Você pode montar o pedido e o valor será confirmado antes do pagamento.</p>` : ""}
          <p class="msg-campo" data-pendencia role="alert"></p>
          <button type="button" class="btn btn-primario btn-bloco" data-adicionar>Adicionar ao carrinho</button>
        </div>
      </div>
    </div>`;

  let moldura = null;
  if (m.previa?.moldura) { try { moldura = await carregarImagem(m.previa.moldura); } catch { moldura = null; } }

  personalizadorAtivo?.destruir();
  const pz = new Personalizador({
    previa: main.querySelector("[data-previa]"),
    controles: main.querySelector("[data-controles]"),
    dimensoes: m.dimensoes,
    regras: {
      ...p.personalizacao,
      rotuloUpload: pet ? "Foto do seu cão ou gato" : "Sua imagem",
      mensagemSemUpload: pet ? "Envie uma foto do seu cão ou gato para continuar." : undefined,
    },
    artes: p.personalizacao.permiteArtes ? artesPublicadas(dados.catalogo) : [],
    upload: dados.loja.upload,
    legenda: `${pet ? m.nome + " · " : ""}${m.dimensoes.rotulo}`,
    moldura,
    aoMudar: est => { if (est.pronto) main.querySelector("[data-pendencia]").textContent = ""; },
  });
  personalizadorAtivo = pz;

  main.querySelectorAll("input[name=modelo]").forEach(r => r.addEventListener("change", () => {
    location.hash = `#/personalizar/${p.id}/${r.value}`;
  }));
  const qtd = main.querySelector("[data-quantidade]");
  main.querySelectorAll("[data-qtd]").forEach(b => b.addEventListener("click", () => {
    qtd.value = carrinho.limitar(Number(qtd.value) + Number(b.dataset.qtd));
  }));
  qtd.addEventListener("change", () => { qtd.value = carrinho.limitar(qtd.value); });

  const botao = main.querySelector("[data-adicionar]");
  botao.addEventListener("click", async () => {
    const est = pz.estado();
    const pend = main.querySelector("[data-pendencia]");
    if (!est.pronto) {
      pend.textContent = est.pendencia || "Aguarde a imagem terminar de carregar.";
      return;
    }
    botao.disabled = true;
    botao.textContent = "Adicionando…";
    try {
      const { blob, miniatura, largura, altura } = await pz.exportar();
      await carrinho.adicionar({
        produtoId: p.id,
        produtoNome: p.nome,
        modeloId: m.id,
        modeloNome: m.nome,
        dimensoes: m.dimensoes,
        precoUnitario: typeof m.preco === "number" ? m.preco : null,
        quantidade: Number(qtd.value),
        miniatura,
        personalizacao: {
          fonte: est.fonte,
          arte: est.arte,
          arquivo: est.arquivo,
          ajuste: est.ajuste,
          imagemFinalPx: { largura, altura },
        },
      }, blob);
      avisar(`${m.nome} adicionado ao carrinho.`);
      location.hash = "#/carrinho";
    } catch (e) {
      console.error(e);
      pend.textContent = "Não foi possível adicionar ao carrinho. Verifique se o navegador permite salvar dados neste site e tente de novo.";
      botao.disabled = false;
      botao.textContent = "Adicionar ao carrinho";
    }
  });
}

function textoPagamentoCurto() {
  const modo = dados.loja.pagamento?.modo;
  if (modo === "manual" && dados.loja.pagamento.pixManual?.chave) return "Pix manual: a loja confere o recebimento antes de confirmar o pedido.";
  if (modo === "whatsapp") return "Pix combinado pelo WhatsApp: depois do pedido, a loja envia a chave Pix e o valor na conversa e confere o recebimento.";
  return "O pagamento por Pix ainda está sendo configurado pela loja. Por enquanto, o pagamento é combinado depois do pedido.";
}

function avisoPagamento() {
  const modo = dados.loja.pagamento?.modo;
  if (modo === "manual" && dados.loja.pagamento.pixManual?.chave) return "";
  if (modo === "whatsapp") return `<p class="aviso aviso-info"><strong>Pix combinado pelo WhatsApp</strong>Este site não cobra nada. Depois que você enviar o pedido, a loja manda a chave Pix e o valor na conversa.</p>`;
  return `<p class="aviso aviso-demo"><strong>Pagamento ainda não configurado</strong>A loja está em modo de demonstração: nenhum Pix é gerado e nenhum valor é cobrado por este site.</p>`;
}

function caixaTotais(lista, { comBotao }) {
  const tot = carrinho.calcularTotais(lista, dados.loja.entrega);
  const entrega = dados.loja.entrega;
  return `
    <aside class="caixa-resumo" aria-label="Resumo">
      <h2 style="font-size:1.2rem;margin:0">Resumo</h2>
      <dl>
        <dt>Subtotal</dt><dd data-subtotal>${brl(tot.subtotal, "A definir")}</dd>
        <dt>Entrega</dt><dd>${entrega.configurada && typeof entrega.valor === "number" ? brl(entrega.valor) : esc(entrega.mensagem || "Entrega a combinar.")}</dd>
        <div class="total" style="display:contents"><dt>Total</dt><dd data-total>${brl(tot.total, "A definir")}</dd></div>
      </dl>
      ${tot.precoIndefinido ? `<p class="aviso">Algum preço ainda não foi definido pela loja. O valor final será informado antes do pagamento.</p>` : ""}
      ${comBotao ? `<a class="btn btn-primario btn-bloco" href="#/checkout">Finalizar compra</a>` : ""}
      <a class="btn btn-texto" href="#/catalogo">Continuar comprando</a>
    </aside>`;
}

function paginaCarrinho() {
  titulo("Carrinho");
  const lista = itensComPrecoAtual();
  if (!lista.length) {
    main.innerHTML = `
      <div class="wrap vazio">
        <h1>Seu carrinho está vazio</h1>
        <p>Escolha um produto e personalize do seu jeito.</p>
        <a class="btn btn-primario" href="#/catalogo">Ver catálogo</a>
      </div>`;
    return;
  }
  main.innerHTML = `
    <div class="wrap cabecalho-pagina"><h1>Carrinho</h1></div>
    <div class="wrap layout-carrinho">
      <div>
        <ul class="itens">
          ${lista.map(i => `
            <li class="item" data-id="${esc(i.id)}">
              <img src="${esc(i.miniatura || "")}" alt="Prévia de ${esc(i.modeloNome)}">
              <div class="det">
                <strong>${esc(i.produtoNome)}: ${esc(i.modeloNome)}</strong>
                <small>${esc(i.dimensoes?.rotulo || "")}</small>
                <small>${esc(descricaoPersonalizacao(i.personalizacao))}</small>
                <small>Preço unitário: ${brl(i.precoUnitario)}</small>
              </div>
              <div class="acoes-item">
                <div class="quantidade" role="group" aria-label="Quantidade de ${esc(i.modeloNome)}">
                  <button type="button" data-q="-1" aria-label="Diminuir">−</button>
                  <input type="number" min="1" max="20" value="${i.quantidade}" inputmode="numeric" aria-label="Quantidade" data-qinput>
                  <button type="button" data-q="1" aria-label="Aumentar">+</button>
                </div>
                <strong data-sub>${brl(carrinho.subtotalItem(i), "A definir")}</strong>
                <button type="button" class="btn-texto" data-remover>Remover</button>
              </div>
            </li>`).join("")}
        </ul>
        <p style="color:var(--color-muted);font-size:.9rem;margin-top:12px">Os itens e as imagens ficam guardados só neste navegador até você finalizar a compra.</p>
      </div>
      ${caixaTotais(lista, { comBotao: true })}
    </div>`;

  main.querySelectorAll(".item").forEach(li => {
    const id = li.dataset.id;
    const input = li.querySelector("[data-qinput]");
    const aplicar = v => { carrinho.alterarQuantidade(id, v); paginaCarrinhoAtualizarValores(); };
    li.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
      input.value = carrinho.limitar(Number(input.value) + Number(b.dataset.q)); aplicar(input.value);
    }));
    input.addEventListener("change", () => { input.value = carrinho.limitar(input.value); aplicar(input.value); });
    li.querySelector("[data-remover]").addEventListener("click", async () => {
      await carrinho.remover(id);
      avisar("Item removido do carrinho.");
      paginaCarrinho();
    });
  });
}

function paginaCarrinhoAtualizarValores() {
  const lista = itensComPrecoAtual();
  lista.forEach(i => {
    const li = main.querySelector(`.item[data-id="${CSS.escape(i.id)}"]`);
    if (li) li.querySelector("[data-sub]").textContent = brl(carrinho.subtotalItem(i), "A definir");
  });
  const tot = carrinho.calcularTotais(lista, dados.loja.entrega);
  main.querySelector("[data-subtotal]").textContent = brl(tot.subtotal, "A definir");
  main.querySelector("[data-total]").textContent = brl(tot.total, "A definir");
}

// ---------------------------------------------------------------- checkout
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const CHAVE_FORM = "empire-checkout";
function lerForm() { try { return JSON.parse(sessionStorage.getItem(CHAVE_FORM)) || {}; } catch { return {}; } }
function gravarForm(v) { try { sessionStorage.setItem(CHAVE_FORM, JSON.stringify(v)); } catch { /* opcional */ } }

const CAMPOS = [
  { id: "nome", rotulo: "Nome completo", tipo: "text", auto: "name", col: "c6", obrig: true },
  { id: "telefone", rotulo: "Telefone (WhatsApp)", tipo: "tel", auto: "tel", col: "c3", obrig: true, modo: "tel" },
  { id: "email", rotulo: "E-mail", tipo: "email", auto: "email", col: "c3", obrig: false },
  { id: "cep", rotulo: "CEP", tipo: "text", auto: "postal-code", col: "c2", obrig: true, modo: "numeric" },
  { id: "estado", rotulo: "Estado", tipo: "select", auto: "address-level1", col: "c2", obrig: true },
  { id: "cidade", rotulo: "Cidade", tipo: "text", auto: "address-level2", col: "c2", obrig: true },
  { id: "bairro", rotulo: "Bairro", tipo: "text", auto: "address-level3", col: "c3", obrig: true },
  { id: "rua", rotulo: "Rua", tipo: "text", auto: "address-line1", col: "c3", obrig: true },
  { id: "numero", rotulo: "Número", tipo: "text", auto: "", col: "c2", obrig: true },
  { id: "complemento", rotulo: "Complemento", tipo: "text", auto: "address-line2", col: "c4", obrig: false },
  { id: "observacoes", rotulo: "Observações", tipo: "textarea", auto: "", col: "c6", obrig: false },
];

export function validarCheckout(v) {
  const erros = {};
  const dig = s => String(s || "").replace(/\D/g, "");
  for (const c of CAMPOS) if (c.obrig && !String(v[c.id] || "").trim()) erros[c.id] = `Preencha ${c.rotulo.toLowerCase().replace(" (whatsapp)", "")}.`;
  if (!erros.nome && String(v.nome).trim().length < 3) erros.nome = "Informe o nome completo.";
  if (!erros.telefone && ![10, 11].includes(dig(v.telefone).length)) erros.telefone = "Informe o telefone com DDD, por exemplo (41) 99999-9999.";
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) erros.email = "Este e-mail não parece válido.";
  if (!erros.cep && dig(v.cep).length !== 8) erros.cep = "O CEP precisa ter 8 números.";
  if (!erros.estado && !UFS.includes(v.estado)) erros.estado = "Escolha o estado.";
  return erros;
}

function paginaCheckout() {
  titulo("Finalizar compra");
  const lista = itensComPrecoAtual();
  if (!lista.length) { location.hash = "#/carrinho"; return; }
  const v = lerForm();
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <h1>Finalizar compra</h1>
      <ol class="etapas"><li class="feita">Carrinho</li><li aria-current="step">Seus dados</li><li>Revisão</li></ol>
      <p>Não é preciso criar conta. Usamos estes dados só para identificar o pedido e fazer a entrega.</p>
    </div>
    <div class="wrap layout-carrinho">
      <form class="form" novalidate data-form>
        <div class="form-grade">
          ${CAMPOS.map(c => campoHTML(c, v[c.id])).join("")}
        </div>
        <p class="msg-campo" data-resumo-erros role="alert"></p>
        <button class="btn btn-primario" type="submit">Revisar pedido</button>
        <a class="btn btn-texto" href="#/carrinho">Voltar ao carrinho</a>
      </form>
      ${caixaTotais(lista, { comBotao: false })}
    </div>`;

  const form = main.querySelector("[data-form]");
  form.addEventListener("input", () => gravarForm(Object.fromEntries(new FormData(form))));
  ligarBuscaCep(form);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const valores = Object.fromEntries(new FormData(form));
    gravarForm(valores);
    const erros = validarCheckout(valores);
    CAMPOS.forEach(c => {
      const el = form.elements[c.id];
      const msg = form.querySelector(`#erro-${c.id}`);
      if (erros[c.id]) { el.setAttribute("aria-invalid", "true"); msg.textContent = erros[c.id]; }
      else { el.removeAttribute("aria-invalid"); msg.textContent = ""; }
    });
    const n = Object.keys(erros).length;
    if (n) {
      form.querySelector("[data-resumo-erros]").textContent = n === 1 ? "Corrija o campo destacado." : `Corrija os ${n} campos destacados.`;
      form.elements[Object.keys(erros)[0]].focus();
      return;
    }
    location.hash = "#/checkout/revisao";
  });
}

/** Ao completar o CEP, preenche rua, bairro, cidade e estado. O cliente pode corrigir depois. */
function ligarBuscaCep(form) {
  const cep = form.elements.cep;
  const status = document.createElement("div");
  status.className = "dica";
  status.id = "status-cep";
  status.setAttribute("aria-live", "polite");
  form.querySelector("#erro-cep").after(status);
  cep.setAttribute("aria-describedby", "erro-cep status-cep");
  let ultimo = cep.value.replace(/\D/g, "");

  cep.addEventListener("input", async () => {
    const formatado = mascaraCep(cep.value);
    if (formatado !== cep.value) cep.value = formatado;
    const digitos = formatado.replace(/\D/g, "");
    if (digitos.length !== 8 || digitos === ultimo) return;
    ultimo = digitos;
    status.textContent = "Buscando endereço…";
    try {
      const end = await buscarCep(digitos);
      if (cep.value.replace(/\D/g, "") !== digitos) return; // o cliente mudou o CEP enquanto buscava
      if (!end) { status.textContent = "CEP não encontrado. Confira o número ou preencha o endereço."; return; }
      form.elements.estado.value = end.estado;
      form.elements.cidade.value = end.cidade;
      form.elements.bairro.value = end.bairro;
      form.elements.rua.value = end.rua;
      ["estado", "cidade", "bairro", "rua"].forEach(id => {
        form.elements[id].removeAttribute("aria-invalid");
        form.querySelector(`#erro-${id}`).textContent = "";
      });
      gravarForm(Object.fromEntries(new FormData(form)));
      if (end.rua) {
        status.textContent = "Endereço encontrado. Confira e informe o número.";
        form.elements.numero.focus();
      } else {
        status.textContent = "Este CEP é da cidade toda. Preencha a rua e o bairro.";
        form.elements.bairro.focus();
      }
    } catch {
      status.textContent = "Não foi possível buscar o CEP agora. Preencha o endereço.";
    }
  });
}

function campoHTML(c, valor = "") {
  const base = `id="${c.id}" name="${c.id}" ${c.auto ? `autocomplete="${c.auto}"` : ""} ${c.obrig ? "required" : ""} aria-describedby="erro-${c.id}"`;
  let ctrl;
  if (c.tipo === "select") {
    ctrl = `<select ${base}><option value="">Selecione</option>${UFS.map(u => `<option ${u === valor ? "selected" : ""}>${u}</option>`).join("")}</select>`;
  } else if (c.tipo === "textarea") {
    ctrl = `<textarea ${base} maxlength="500">${esc(valor)}</textarea>`;
  } else {
    ctrl = `<input type="${c.tipo}" ${base} value="${esc(valor)}" ${c.modo ? `inputmode="${c.modo}"` : ""} maxlength="120">`;
  }
  return `<div class="campo ${c.col}"><label for="${c.id}">${c.rotulo}${c.obrig ? "" : ` <span class="opcional">(opcional)</span>`}</label>${ctrl}<div class="erro" id="erro-${c.id}"></div></div>`;
}

function paginaRevisao() {
  titulo("Revisar pedido");
  const lista = itensComPrecoAtual();
  const v = lerForm();
  if (!lista.length) { location.hash = "#/carrinho"; return; }
  if (Object.keys(validarCheckout(v)).length) { location.hash = "#/checkout"; return; }
  const tot = carrinho.calcularTotais(lista, dados.loja.entrega);
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <h1>Revisar pedido</h1>
      <ol class="etapas"><li class="feita">Carrinho</li><li class="feita">Seus dados</li><li aria-current="step">Revisão</li></ol>
    </div>
    <div class="wrap layout-carrinho">
      <div>
        <h2 style="font-size:1.2rem">Produtos</h2>
        <div class="rolagem-x">
          <table class="tabela-resumo">
            <thead><tr><th>Prévia</th><th>Produto</th><th class="num">Qtd.</th><th class="num">Unitário</th><th class="num">Subtotal</th></tr></thead>
            <tbody>${lista.map(i => `
              <tr>
                <td><img src="${esc(i.miniatura || "")}" alt="Prévia de ${esc(i.modeloNome)}"></td>
                <td><strong>${esc(i.produtoNome)}: ${esc(i.modeloNome)}</strong><br><small>${esc(i.dimensoes?.rotulo || "")} · ${esc(descricaoPersonalizacao(i.personalizacao))}</small></td>
                <td class="num">${i.quantidade}</td>
                <td class="num">${brl(i.precoUnitario, "A definir")}</td>
                <td class="num">${brl(carrinho.subtotalItem(i), "A definir")}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
        <h2 style="font-size:1.2rem;margin-top:24px">Entrega</h2>
        <p>${esc(v.nome)} · ${esc(v.telefone)}${v.email ? " · " + esc(v.email) : ""}<br>
          ${esc(v.rua)}, ${esc(v.numero)}${v.complemento ? " · " + esc(v.complemento) : ""}<br>
          ${esc(v.bairro)} · ${esc(v.cidade)}/${esc(v.estado)} · CEP ${esc(v.cep)}</p>
        ${v.observacoes ? `<p><strong>Observações:</strong> ${esc(v.observacoes)}</p>` : ""}
        <a class="btn btn-texto" href="#/checkout">Corrigir dados</a>
        <a class="btn btn-texto" href="#/carrinho">Alterar produtos</a>
        <h2 style="font-size:1.2rem;margin-top:24px">Pagamento</h2>
        <p>Pix.</p>
        ${avisoPagamento()}
      </div>
      <aside class="caixa-resumo" aria-label="Total do pedido">
        <dl>
          <dt>Subtotal</dt><dd>${brl(tot.subtotal, "A definir")}</dd>
          <dt>Entrega</dt><dd>${tot.frete != null ? brl(tot.frete) : esc(dados.loja.entrega.mensagem || "Entrega a combinar.")}</dd>
          <div class="total" style="display:contents"><dt>Total</dt><dd>${brl(tot.total, "A definir")}</dd></div>
        </dl>
        ${tot.precoIndefinido ? `<p class="aviso">Algum preço ainda não foi definido. O valor final será confirmado pela loja antes do pagamento.</p>` : ""}
        <button type="button" class="btn btn-primario btn-bloco" data-confirmar>Confirmar pedido</button>
        <p style="font-size:.85rem;color:var(--color-muted);margin:0">Ao confirmar, você concorda com a <a href="#/privacidade">política de privacidade</a>.</p>
      </aside>
    </div>`;

  main.querySelector("[data-confirmar]").addEventListener("click", async e => {
    e.target.disabled = true;
    const anterior = lerUltimoPedido();
    const pedido = montarPedido({
      itens: lista,
      cliente: { nome: v.nome.trim(), telefone: v.telefone.trim(), email: (v.email || "").trim() },
      endereco: { cep: v.cep, estado: v.estado, cidade: v.cidade, bairro: v.bairro, rua: v.rua, numero: v.numero, complemento: v.complemento || null },
      observacoes: (v.observacoes || "").trim(),
      totais: tot,
      loja: dados.loja,
    });
    if (!gravarUltimoPedido(pedido)) {
      e.target.disabled = false;
      avisar("Não foi possível guardar o pedido neste navegador. Tente novamente.");
      return;
    }
    if (anterior) await Promise.all(anterior.itens.filter(i => i.referenciaImagem).map(i => apagarImagem(i.referenciaImagem)));
    await carrinho.esvaziar({ manterImagens: true });
    try { sessionStorage.removeItem(CHAVE_FORM); } catch { /* opcional */ }
    location.hash = "#/pedido";
  });
}

const CHAVE_PEDIDO = "empire-ultimo-pedido";
function lerUltimoPedido() { try { return JSON.parse(localStorage.getItem(CHAVE_PEDIDO)); } catch { return null; } }
function gravarUltimoPedido(p) { try { localStorage.setItem(CHAVE_PEDIDO, JSON.stringify(p)); return true; } catch { return false; } }

function textoPedido(p) {
  const L = [];
  L.push(`*Pedido ${p.codigo}* · Mats & Mouse Pads Empire`);
  L.push("");
  p.itens.forEach((i, n) => {
    L.push(`${n + 1}. ${i.produtoNome}: ${i.modeloNome} (${i.dimensoes?.rotulo || ""})`);
    L.push(`   ${descricaoPersonalizacao(i.personalizacao)}`);
    L.push(`   Quantidade: ${i.quantidade} · Unitário: ${brl(i.precoUnitario, "a definir")}`);
  });
  L.push("");
  L.push(`Subtotal: ${brl(p.valores.subtotal, "a definir")}`);
  L.push(`Entrega: ${p.valores.frete != null ? brl(p.valores.frete) : p.valores.entregaMensagem}`);
  L.push(`*Total: ${brl(p.valores.total, "a definir")}*`);
  L.push(`Pagamento: Pix (${{ manual: "manual", whatsapp: "combinar a chave por aqui" }[p.pagamento.modo] || "a combinar"})`);
  L.push("");
  L.push(`Cliente: ${p.cliente.nome}`);
  L.push(`Telefone: ${p.cliente.telefone}${p.cliente.email ? " · " + p.cliente.email : ""}`);
  const e = p.endereco;
  L.push(`Endereço: ${e.rua}, ${e.numero}${e.complemento ? " - " + e.complemento : ""}, ${e.bairro}, ${e.cidade}/${e.estado}, CEP ${e.cep}`);
  if (p.observacoes) L.push(`Observações: ${p.observacoes}`);
  if (p.itens.some(i => i.personalizacao?.fonte === "upload")) {
    L.push("");
    L.push("Vou enviar as imagens personalizadas nesta conversa.");
  }
  return L.join("\n");
}

function paginaPedido() {
  titulo("Pedido");
  const p = lerUltimoPedido();
  if (!p) {
    main.innerHTML = `<div class="wrap vazio"><h1>Nenhum pedido neste aparelho</h1><p>Os pedidos feitos neste navegador aparecem aqui.</p><a class="btn btn-primario" href="#/catalogo">Ver catálogo</a></div>`;
    return;
  }
  const loja = dados.loja;
  const whats = String(loja.pedidos?.whatsapp || "").replace(/\D/g, "");
  const pixManual = loja.pagamento?.modo === "manual" && loja.pagamento.pixManual?.chave;
  const temImagens = p.itens.some(i => i.referenciaImagem);
  main.innerHTML = `
    <div class="wrap cabecalho-pagina">
      <h1>Pedido ${esc(p.codigo)}</h1>
      <p>Status: <span class="status-pedido">${esc(STATUS[p.status] || p.status)}</span></p>
    </div>
    <div class="wrap texto-longo" style="max-width:none">
      <div class="grade-2">
        <section>
          <h2>Envie o pedido para a loja</h2>
          ${whats ? `
            <p>Para a loja receber o seu pedido, envie a mensagem pelo WhatsApp${temImagens ? " e anexe as imagens personalizadas" : ""}.</p>
            <p><a class="btn btn-primario" target="_blank" rel="noopener" href="https://wa.me/${whats}?text=${encodeURIComponent(textoPedido(p))}">Enviar pedido pelo WhatsApp</a></p>`
          : `<p class="aviso aviso-alerta"><strong>Este pedido ainda não foi enviado para a loja.</strong>O envio de pedidos ainda não foi configurado. Guarde o resumo e as imagens abaixo e entregue para a loja pelo contato que você recebeu.</p>`}
          <div class="ajuste-linha" style="margin-top:12px">
            <button type="button" class="btn btn-contorno" data-baixar-resumo>Baixar resumo do pedido</button>
            ${temImagens ? `<button type="button" class="btn btn-contorno" data-baixar-imagens>Baixar imagens</button>` : ""}
          </div>
        </section>
        <section>
          <h2>Pagamento</h2>
          ${pixManual ? `
            <p class="aviso aviso-info"><strong>Pix manual</strong>Chave: <span style="font-family:monospace">${esc(loja.pagamento.pixManual.chave)}</span>${loja.pagamento.pixManual.titular ? `<br>Titular: ${esc(loja.pagamento.pixManual.titular)}` : ""}<br>
            ${p.valores.total != null ? `Valor: <strong>${brl(p.valores.total)}</strong>` : "O valor será confirmado pela loja antes do pagamento."}<br>
            A loja confere o recebimento e só então muda o status do pedido.</p>`
          : loja.pagamento?.modo === "whatsapp"
            ? `<p class="aviso aviso-info"><strong>Pix combinado pelo WhatsApp</strong>Depois de enviar o pedido, a loja manda a chave Pix e o valor na conversa. O pedido só sai de "Aguardando pagamento" quando a loja conferir o recebimento.</p>`
            : `<p class="aviso aviso-demo"><strong>Pagamento ainda não configurado</strong>Este é um modo de demonstração. Nenhum Pix foi gerado e nenhum valor foi cobrado. A loja vai combinar o pagamento com você.</p>`}
        </section>
      </div>
      <h2>Resumo</h2>
      <div class="rolagem-x">
        <table class="tabela-resumo">
          <thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Unitário</th></tr></thead>
          <tbody>${p.itens.map(i => `<tr><td><strong>${esc(i.produtoNome)}: ${esc(i.modeloNome)}</strong><br><small>${esc(descricaoPersonalizacao(i.personalizacao))}</small></td><td class="num">${i.quantidade}</td><td class="num">${brl(i.precoUnitario, "A definir")}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p style="margin-top:12px"><strong>Total: ${brl(p.valores.total, "a definir")}</strong> · Entrega: ${esc(p.valores.frete != null ? brl(p.valores.frete) : p.valores.entregaMensagem)}</p>
      <p style="color:var(--color-muted);font-size:.9rem">Este resumo fica guardado só neste navegador.</p>
      <a class="btn btn-escuro" href="#/catalogo">Voltar ao catálogo</a>
    </div>`;

  main.querySelector("[data-baixar-resumo]").addEventListener("click", () => {
    baixar(new Blob([textoPedido(p).replace(/\*/g, "")], { type: "text/plain;charset=utf-8" }), `pedido-${p.codigo}.txt`);
  });
  main.querySelector("[data-baixar-imagens]")?.addEventListener("click", async () => {
    let n = 0;
    for (const [idx, i] of p.itens.entries()) {
      if (!i.referenciaImagem) continue;
      const blob = await lerImagem(i.referenciaImagem);
      if (blob) { baixar(blob, `pedido-${p.codigo}-item${idx + 1}.jpg`); n++; }
    }
    avisar(n ? `${n} ${n === 1 ? "imagem baixada" : "imagens baixadas"}.` : "As imagens não estão mais disponíveis neste navegador.");
  });
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function paginaPrivacidade() {
  titulo("Privacidade");
  main.innerHTML = `
    <div class="wrap cabecalho-pagina"><h1>Política de privacidade</h1><p>Como este site trata os seus dados hoje.</p></div>
    <div class="wrap texto-longo">
      <h2>Quais dados pedimos</h2>
      <p>Nome, telefone, e-mail (opcional) e endereço de entrega, além das imagens que você enviar para personalizar os produtos. Pedimos apenas o necessário para produzir e entregar o pedido.</p>
      <h2>Onde ficam os dados</h2>
      <ul>
        <li>As imagens são processadas no seu próprio navegador. Elas <strong>não são enviadas a nenhum servidor</strong> por este site.</li>
        <li>O carrinho, as imagens personalizadas e o resumo do último pedido ficam guardados só neste aparelho, no armazenamento do navegador. Você pode apagá-los limpando os dados do site no navegador.</li>
        <li>Quando você digita o CEP no checkout, só o número do CEP é consultado no serviço público ViaCEP para preencher o endereço.</li>
        <li>Os dados só chegam à loja quando você envia o pedido pelo canal indicado (por exemplo, WhatsApp). A partir daí, valem também as regras desse serviço.</li>
      </ul>
      <h2>Para que usamos</h2>
      <p>Para produzir os produtos personalizados, combinar o pagamento e fazer a entrega. Não vendemos nem compartilhamos seus dados para publicidade, e não publicamos as fotos enviadas sem a sua autorização.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir para a loja corrigir ou apagar os dados que enviou, pelo mesmo canal usado no pedido.</p>
      <h2>Sobre a loja</h2>
      <p>A Mats & Mouse Pads Empire é um projeto de empreendedorismo escolar, acompanhado por um adulto responsável. Este texto descreve o funcionamento atual do site e será revisado quando a loja passar a guardar pedidos em um servidor ou a usar um serviço de pagamento.</p>
    </div>`;
}

function pagina404() {
  titulo("Página não encontrada");
  main.innerHTML = `<div class="wrap vazio"><h1>Página não encontrada</h1><a class="btn btn-primario" href="#/">Ir para o início</a></div>`;
}

// ---------------------------------------------------------------- roteador
async function rotear() {
  const rota = location.hash.replace(/^#/, "") || "/";
  const partes = rota.split("/").filter(Boolean);
  personalizadorAtivo?.destruir();
  personalizadorAtivo = null;
  marcarMenu(rota);
  document.getElementById("menu").classList.remove("aberto");
  document.querySelector(".menu-btn").setAttribute("aria-expanded", "false");

  if (!dados) {
    main.innerHTML = `<div class="wrap vazio"><p>Carregando…</p></div>`;
    try { dados = await carregarDados(); }
    catch {
      main.innerHTML = `<div class="wrap vazio"><h1>Não foi possível carregar a loja</h1><p>Verifique sua conexão e tente de novo.</p><button class="btn btn-primario" onclick="location.reload()">Tentar de novo</button></div>`;
      return;
    }
  }

  switch (partes[0]) {
    case undefined: paginaInicio(); break;
    case "catalogo": paginaCatalogo(); break;
    case "mousepads": paginaCategoria("mousepad"); break;
    case "tapetes-pet": paginaCategoria("tapete-pet"); break;
    case "personalizar": await paginaPersonalizar(partes[1], partes[2]); break;
    case "carrinho": paginaCarrinho(); break;
    case "checkout": partes[1] === "revisao" ? paginaRevisao() : paginaCheckout(); break;
    case "pedido": paginaPedido(); break;
    case "privacidade": paginaPrivacidade(); break;
    case "como-funciona": paginaComoFunciona(); break;
    default: pagina404();
  }
  window.scrollTo(0, 0);
  if (document.activeElement && document.activeElement !== document.body) main.focus({ preventScroll: true });
}

document.querySelector(".menu-btn").addEventListener("click", e => {
  const menu = document.getElementById("menu");
  const aberto = menu.classList.toggle("aberto");
  e.currentTarget.setAttribute("aria-expanded", String(aberto));
});
document.querySelector("[data-ano]").textContent = new Date().getFullYear();
carrinho.aoMudar(atualizarContador);
window.addEventListener("storage", atualizarContador);
window.addEventListener("hashchange", rotear);
atualizarContador();
rotear();
