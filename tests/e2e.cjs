// Testes de ponta a ponta da loja (Playwright + servidor estático local).
// Rodar: npm test   (requer o pacote "playwright" com o Chromium instalado)
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..", "public");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

function servidor() {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const arq = path.join(RAIZ, url === "/" ? "index.html" : url);
      if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
      fs.createReadStream(arq).pipe(res);
    });
    s.listen(0, "127.0.0.1", () => ok(s));
  });
}

async function gerarPNG(page, cor, w = 1600, h = 1200) {
  const b64 = await page.evaluate(([cor, w, h]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = cor; x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff"; x.fillRect(w / 4, h / 4, w / 2, h / 2);
    return c.toDataURL("image/png").split(",")[1];
  }, [cor, w, h]);
  return Buffer.from(b64, "base64");
}

const resultados = [];
async function cenario(nome, fn) {
  try { await fn(); resultados.push([nome, true]); console.log("✓", nome); }
  catch (e) { resultados.push([nome, false]); console.log("✗", nome, "\n   ", e.message); }
}

(async () => {
  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errosJS = [];
  page.on("pageerror", e => errosJS.push(e.message));
  // As fontes externas não são necessárias para os testes.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // ViaCEP simulado: os testes não dependem da internet.
  const CEPS = { "80010000": { logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" }, "83700000": { logradouro: "", bairro: "", localidade: "Araucária", uf: "PR" } };
  await page.route(/viacep\.com\.br\/ws\/(\d{8})\/json/, r => {
    const cep = r.request().url().match(/ws\/(\d{8})/)[1];
    r.fulfill({ json: CEPS[cep] || { erro: "true" }, headers: { "Access-Control-Allow-Origin": "*" } });
  });

  const irPara = async hash => { await page.goto(base + hash); await page.waitForSelector("main > *:not(noscript)"); };
  const itensCarrinho = () => page.evaluate(() => JSON.parse(localStorage.getItem("empire-carrinho-v1") || "[]"));
  const limpar = async () => { await page.evaluate(() => localStorage.clear()); };

  await irPara("#/");
  await limpar();

  await cenario("Página inicial mostra marca, chamadas e categorias", async () => {
    await irPara("#/");
    assert.match(await page.textContent("h1"), /Sua criatividade\. Seus produtos\. Seu estilo\./);
    assert.equal(await page.locator(".topo img[alt='Mats & Mouse Pads Empire']").count(), 1);
    // primeira dobra: dois produtos com imagens carregadas e botões que levam às páginas reais
    await page.waitForFunction(() => [...document.querySelectorAll(".dobra img")].every(i => i.complete));
    const imgs = await page.$$eval(".dobra img", els => els.map(i => i.naturalWidth > 0));
    assert.deepEqual(imgs, [true, true]);
    assert.ok(await page.isVisible(".dobra >> text=Desk Pads Gamer"));
    assert.ok(await page.isVisible(".dobra >> text=Tapetes Pet Personalizados"));
    await page.click("a:has-text('Explorar Desk Pads')");
    await page.waitForURL(/#\/mousepads$/);
    await page.waitForSelector("h1:has-text('Mousepad')");
    await irPara("#/");
    await page.click("a:has-text('Personalizar Tapete Pet')");
    await page.waitForURL(/#\/tapetes-pet$/);
    await page.waitForSelector("h1:has-text('Tapete')");
  });

  await cenario("1. Mousepad com arte pronta, sem enviar imagem", async () => {
    await irPara("#/personalizar/mousepad/m");
    await page.click("label.opcao:has(input[value=arte])");
    await page.click("label.opcao-arte:has(input[value=neon-gamer])");
    await page.waitForSelector("[data-ajustes]:not([hidden])");
    await page.click("[data-adicionar]");
    await page.waitForURL(/#\/carrinho/);
    const itens = await itensCarrinho();
    assert.equal(itens.length, 1);
    assert.equal(itens[0].personalizacao.fonte, "arte");
    assert.equal(itens[0].personalizacao.arte.id, "neon-gamer");
    assert.equal(await page.locator(".item").count(), 1);
    assert.match(await page.textContent(".item"), /Arte da loja: Neon Gamer/);
  });

  await cenario("2. Mousepad com imagem própria, ajuste e prévia", async () => {
    await irPara("#/personalizar/mousepad/g");
    await page.click("label.opcao:has(input[value=upload])");
    await page.setInputFiles("[data-arquivo]", { name: "minha-foto.png", mimeType: "image/png", buffer: await gerarPNG(page, "#2244aa", 4000, 1800) });
    await page.waitForSelector("[data-ajustes]:not([hidden])");
    await page.fill("[data-zoom]", "2");
    await page.dispatchEvent("[data-zoom]", "input");
    await page.click("[data-mover='1,0']");
    const box = await page.locator(".previa-palco canvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2); await page.mouse.up();
    await page.click("[data-adicionar]");
    await page.waitForURL(/#\/carrinho/);
    const itens = await itensCarrinho();
    const novo = itens.at(-1);
    assert.equal(novo.personalizacao.fonte, "upload");
    assert.equal(novo.personalizacao.arquivo.nome, "minha-foto.png");
    assert.equal(novo.personalizacao.ajuste.zoom, 2);
    assert.notEqual(novo.personalizacao.ajuste.x, 0.5);
    assert.ok(novo.miniatura.startsWith("data:image/jpeg"));
  });

  await cenario("3. Tapete pet sem fotografia não avança", async () => {
    await irPara("#/personalizar/tapete-pet/classico");
    assert.equal(await page.locator("input[name=arte]").count(), 0, "não deve haver artes prontas");
    const antes = (await itensCarrinho()).length;
    await page.click("[data-adicionar]");
    assert.match(await page.textContent("[data-pendencia]"), /Envie uma foto do seu cão ou gato/);
    assert.match(page.url(), /personalizar\/tapete-pet/);
    assert.equal((await itensCarrinho()).length, antes);
    assert.match(await page.textContent("main"), /40 × 60 cm/);
  });

  await cenario("4. Tapete pet com fotografia (Modelo Divertido)", async () => {
    await irPara("#/tapetes-pet");
    assert.ok(await page.isVisible("text=Modelo Clássico"));
    await page.click(".cartao:has-text('Modelo Divertido') >> text=Personalizar");
    await page.waitForURL(/tapete-pet\/divertido/);
    await page.setInputFiles("[data-arquivo]", { name: "rex.png", mimeType: "image/png", buffer: await gerarPNG(page, "#aa6622", 2400, 1600) });
    await page.waitForSelector("[data-ajustes]:not([hidden])");
    await page.click("[data-mover='0,-1']");
    // substituir a foto antes de adicionar
    await page.setInputFiles("[data-arquivo]", { name: "mia.png", mimeType: "image/png", buffer: await gerarPNG(page, "#663399", 2400, 1600) });
    await page.waitForFunction(() => document.querySelector("[data-nome]").textContent === "mia.png");
    await page.click("[data-adicionar]");
    await page.waitForURL(/#\/carrinho/);
    const novo = (await itensCarrinho()).at(-1);
    assert.equal(novo.modeloNome, "Modelo Divertido");
    assert.equal(novo.personalizacao.arquivo.nome, "mia.png");
    assert.equal(novo.dimensoes.rotulo, "40 × 60 cm");
  });

  await cenario("5. Dois mousepads iguais com imagens diferentes ficam separados", async () => {
    await limpar();
    for (const [nome, cor] of [["a.png", "#ff0000"], ["b.png", "#00ff00"]]) {
      await irPara("#/personalizar/mousepad/p");
      await page.click("label.opcao:has(input[value=upload])");
      await page.setInputFiles("[data-arquivo]", { name: nome, mimeType: "image/png", buffer: await gerarPNG(page, cor) });
      await page.waitForSelector("[data-ajustes]:not([hidden])");
      await page.click("[data-adicionar]");
      await page.waitForURL(/#\/carrinho/);
    }
    const itens = await itensCarrinho();
    assert.equal(itens.length, 2);
    assert.equal(itens[0].modeloId, itens[1].modeloId);
    assert.notEqual(itens[0].id, itens[1].id);
    assert.notEqual(itens[0].miniatura, itens[1].miniatura);
    assert.equal(await page.locator(".item").count(), 2);
    // mudar a quantidade de um não altera o outro
    await page.locator(".item").first().locator("[data-q='1']").click();
    const depois = await itensCarrinho();
    assert.equal(depois[0].quantidade, 2);
    assert.equal(depois[1].quantidade, 1);
    assert.equal(depois[1].personalizacao.arquivo.nome, "b.png");
  });

  await cenario("6. Quantidades recalculam subtotal e total", async () => {
    // Usa um preço de teste só nesta página, sem alterar o catálogo real.
    await page.route("**/data/catalogo.json", async r => {
      const resp = await r.fetch(); const json = await resp.json();
      json.produtos.find(p => p.id === "mousepad").modelos.find(m => m.id === "p").preco = 10;
      r.fulfill({ response: resp, json });
    });
    await irPara("#/carrinho");
    await page.reload();
    await page.waitForSelector(".item");
    const primeiro = page.locator(".item").first();
    await primeiro.locator("[data-qinput]").fill("3");
    await primeiro.locator("[data-qinput]").dispatchEvent("change");
    const norm = s => s.replace(/\s/g, " ");
    assert.equal(norm(await primeiro.locator("[data-sub]").textContent()), "R$ 30,00");
    assert.equal(norm(await page.textContent("[data-total]")), "R$ 40,00");
    await primeiro.locator("[data-q='-1']").click();
    assert.equal(norm(await page.textContent("[data-total]")), "R$ 30,00");
    await page.unroute("**/data/catalogo.json");
  });

  await cenario("7. Arquivo inválido ou grande demais é recusado com mensagem", async () => {
    await irPara("#/personalizar/tapete-pet/classico");
    await page.setInputFiles("[data-arquivo]", { name: "documento.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
    assert.match(await page.textContent("[data-erro]"), /não é uma imagem aceita/);
    assert.ok(await page.isHidden("[data-ajustes]"));
    const grande = Buffer.alloc(16 * 1024 * 1024, 0);
    await page.setInputFiles("[data-arquivo]", { name: "enorme.jpg", mimeType: "image/jpeg", buffer: grande });
    assert.match(await page.textContent("[data-erro]"), /limite é 15 MB/);
    await page.setInputFiles("[data-arquivo]", { name: "quebrada.png", mimeType: "image/png", buffer: Buffer.from("isto não é png") });
    await page.waitForFunction(() => /Não conseguimos abrir/.test(document.querySelector("[data-erro]").textContent));
  });

  await cenario("Remover item e carrinho vazio", async () => {
    await irPara("#/carrinho");
    while (await page.locator(".item").count()) {
      const n = await page.locator(".item").count();
      await page.locator(".item [data-remover]").first().click();
      await page.waitForFunction(n => document.querySelectorAll(".item").length < n, n);
    }
    assert.match(await page.textContent("main"), /Seu carrinho está vazio/);
  });

  await cenario("Checkout valida campos e pedido fica aguardando pagamento (demonstração)", async () => {
    await irPara("#/personalizar/mousepad/m");
    await page.click("label.opcao:has(input[value=arte])");
    await page.click("label.opcao-arte:has(input[value=abstrato])");
    await page.waitForSelector("[data-ajustes]:not([hidden])");
    await page.click("[data-adicionar]");
    await page.waitForURL(/#\/carrinho/);
    await page.click("text=Finalizar compra");
    await page.click("button:has-text('Revisar pedido')");
    assert.match(await page.textContent("[data-resumo-erros]"), /Corrija os \d+ campos/);
    assert.equal(await page.getAttribute("#nome", "aria-invalid"), "true");
    await page.fill("#nome", "Cliente de Teste");
    await page.fill("#telefone", "41999998888");
    await page.fill("#cep", "123");
    await page.selectOption("#estado", "PR");
    await page.fill("#cidade", "Curitiba");
    await page.fill("#bairro", "Centro");
    await page.fill("#rua", "Rua Teste");
    await page.fill("#numero", "10");
    await page.click("button:has-text('Revisar pedido')");
    assert.match(await page.textContent("#erro-cep"), /8 números/);
    await page.fill("#cep", "80000-000");
    await page.click("button:has-text('Revisar pedido')");
    const errosForm = await page.$$eval(".campo .erro", els => els.map(e => e.textContent).filter(Boolean));
    assert.deepEqual(errosForm, []);
    await page.waitForURL(/checkout\/revisao/);
    assert.match(await page.textContent("main"), /Entrega a combinar/);
    assert.match(await page.textContent("main"), /Pix combinado pelo WhatsApp|Pagamento ainda não configurado/);
    assert.doesNotMatch(await page.textContent("main"), /Chave:/);
    // voltar e corrigir mantém os dados
    await page.click("text=Corrigir dados");
    assert.equal(await page.inputValue("#nome"), "Cliente de Teste");
    await page.click("button:has-text('Revisar pedido')");
    await page.click("[data-confirmar]");
    await page.waitForURL(/#\/pedido/);
    assert.match(await page.textContent(".status-pedido"), /Aguardando pagamento/);
    const whats = await page.evaluate(() => fetch("data/loja.json").then(r => r.json()).then(l => l.pedidos.whatsapp));
    if (whats) {
      const link = await page.getAttribute("a:has-text('Enviar pedido pelo WhatsApp')", "href");
      assert.ok(link.startsWith(`https://wa.me/${whats}?text=`));
      assert.match(decodeURIComponent(link), /Pedido EMP-[A-Z0-9]{6}/);
    } else {
      assert.match(await page.textContent("main"), /ainda não foi enviado/);
    }
    assert.doesNotMatch(await page.textContent("main"), /Pagamento confirmado/);
    const pedido = await page.evaluate(() => JSON.parse(localStorage.getItem("empire-ultimo-pedido")));
    assert.equal(pedido.status, "aguardando_pagamento");
    assert.equal(pedido.pagamento.confirmado, false);
    assert.equal(pedido.itens[0].personalizacao.arte.id, "abstrato");
    assert.equal((await itensCarrinho()).length, 0);
  });

  await cenario("CEP preenche o endereço automaticamente", async () => {
    await irPara("#/personalizar/mousepad/p");
    await page.click("label.opcao:has(input[value=arte])");
    await page.click("label.opcao-arte:has(input[value=ceu-pastel])");
    await page.waitForSelector("[data-ajustes]:not([hidden])");
    await page.click("[data-adicionar]");
    await page.waitForURL(/#\/carrinho/);
    await page.click("text=Finalizar compra");
    await page.evaluate(() => sessionStorage.clear());
    await irPara("#/carrinho"); await irPara("#/checkout");
    await page.fill("#cep", "80010000");
    await page.waitForFunction(() => document.querySelector("#rua").value === "Rua XV de Novembro");
    assert.equal(await page.inputValue("#cep"), "80010-000");
    assert.equal(await page.inputValue("#bairro"), "Centro");
    assert.equal(await page.inputValue("#cidade"), "Curitiba");
    assert.equal(await page.inputValue("#estado"), "PR");
    assert.match(await page.textContent("#status-cep"), /Endereço encontrado/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "numero");
    await page.fill("#cep", "99999999");
    await page.waitForFunction(() => /CEP não encontrado/.test(document.querySelector("#status-cep").textContent));
    await page.fill("#cep", "83700000");
    await page.waitForFunction(() => /cidade toda/.test(document.querySelector("#status-cep").textContent));
    assert.equal(await page.inputValue("#cidade"), "Araucária");
  });

  await cenario("Layout sem rolagem horizontal no celular", async () => {
    for (const h of ["#/", "#/catalogo", "#/personalizar/mousepad/g", "#/carrinho", "#/privacidade"]) {
      await irPara(h);
      const largura = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(largura <= 390, `${h} tem ${largura}px de largura`);
    }
  });

  await cenario("Sem erros de JavaScript", async () => { assert.deepEqual(errosJS, []); });

  await browser.close();
  srv.close();
  const falhas = resultados.filter(r => !r[1]).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} cenários passaram.`);
  process.exit(falhas ? 1 : 0);
})();
