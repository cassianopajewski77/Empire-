// Componente reutilizável de personalização de imagem.
// Faz: escolha de arte pronta (quando permitido), envio de imagem, validação,
// prévia no formato real do produto, escala, posicionamento (arrastar, setas,
// pinça no celular), recorte pela área do produto, restaurar, substituir e remover.
// As regras comerciais de cada produto chegam por configuração (opcoes.regras).

import { esc, tamanhoMB } from "./util.js";

const MARGEM_SEGURANCA_CM = 1; // faixa perto da borda que pode ficar no acabamento
const ZOOM_MAX = 4;
const LARGURA_MAX_PRODUCAO = 4000;
const PX_POR_CM_PRODUCAO = 50;

export class Personalizador {
  /**
   * @param {object} opcoes
   * @param {HTMLElement} opcoes.previa elemento onde a prévia é desenhada
   * @param {HTMLElement} opcoes.controles elemento onde ficam os controles
   * @param {{larguraCm:number, alturaCm:number, rotulo?:string}} opcoes.dimensoes
   * @param {object} opcoes.regras { uploadObrigatorio, permiteArtes, orientacaoUpload, rotuloUpload }
   * @param {Array} opcoes.artes artes prontas (quando permiteArtes)
   * @param {object} opcoes.upload { tamanhoMaximoMB, tiposAceitos, pixelsPorCmMinimo }
   * @param {string} [opcoes.legenda] texto mostrado sob a prévia (ex.: nome do modelo)
   * @param {Function} [opcoes.aoMudar]
   * @param {string} [opcoes.arteInicial] id da arte já escolhida (vinda da galeria)
   * @param {string} [opcoes.fonteInicial] "arte" ou "upload"
   */
  constructor(opcoes) {
    this.o = opcoes;
    this.fonte = opcoes.regras.permiteArtes ? null : "upload"; // "arte" | "upload"
    this.imagem = null;
    this.arte = null;
    this.arquivo = null;
    this.t = { zoom: 1, x: 0.5, y: 0.5 }; // x, y: centro da área visível, em fração da imagem
    this.mostrarArea = true;
    this.carregando = false;
    this.erro = "";
    this.urlTemp = null;
    this.montar();
    this.aplicarEscolhaInicial();
  }

  /** Abre já com a arte escolhida na galeria (ou com o envio de imagem aberto). */
  aplicarEscolhaInicial() {
    const { arteInicial, fonteInicial, regras } = this.o;
    if (!regras.permiteArtes) return;
    const radioArte = arteInicial && [...this.o.controles.querySelectorAll("input[name=arte]")].find(r => r.value === arteInicial);
    const fonte = radioArte ? "arte" : fonteInicial === "upload" ? "upload" : null;
    if (!fonte) return;
    this.o.controles.querySelector(`input[name=fonte][value=${fonte}]`).checked = true;
    if (radioArte) radioArte.checked = true;
    this.trocarFonte(fonte);
  }

  get dims() { return this.o.dimensoes; }

  // ---------- Interface ----------
  montar() {
    const { regras, artes = [], upload } = this.o;
    const tipos = upload.tiposAceitos.map(t => t.replace("image/", "").toUpperCase().replace("JPEG", "JPG")).join(", ");
    this.o.previa.innerHTML = `
      <div class="previa-box">
        <div class="previa-palco">
          <canvas tabindex="0" role="img" aria-label="Prévia do produto. Use as setas do teclado para mover a imagem e + ou - para mudar o tamanho."></canvas>
          <div class="carregando" hidden>Carregando imagem…</div>
        </div>
        <div class="previa-legenda">
          <span data-legenda></span>
          <label><input type="checkbox" data-area checked> Mostrar margem de segurança</label>
        </div>
        <p class="aviso-previa" data-aviso-previa><strong>Prévia ilustrativa.</strong> A peça impressa pode ter pequenas diferenças de cor e de enquadramento.</p>
      </div>`;

    const blocoArtes = regras.permiteArtes ? `
      <fieldset class="grupo">
        <legend>Imagem do produto</legend>
        <div class="alternador" role="radiogroup">
          <label class="opcao"><input type="radio" name="fonte" value="arte"><strong>Arte da loja</strong><small>Sem enviar arquivo</small></label>
          <label class="opcao"><input type="radio" name="fonte" value="upload"><strong>Minha imagem</strong><small>Envie uma foto ou arte</small></label>
        </div>
      </fieldset>
      <fieldset class="grupo" data-bloco-artes hidden>
        <legend>Escolha uma arte</legend>
        ${artes.length ? `<div class="opcoes">${artes.map(a => `
          <label class="opcao opcao-arte"><input type="radio" name="arte" value="${esc(a.id)}">
            <img src="${esc(a.miniatura || a.imagem)}" alt="" loading="lazy" width="300" height="200"><span>${esc(a.nome)}${a.provisoria ? `<small class="tag-provisoria">Provisória</small>` : a.ilustrativa ? `<small class="tag-provisoria">Imagem ilustrativa</small>` : ""}</span></label>`).join("")}</div>
        ${artes.some(a => a.provisoria) ? `<p class="dica-artes">Artes marcadas como provisórias são imagens de demonstração. A arte final pode ter pequenas diferenças.</p>` : ""}`
          : `<p class="aviso">Nenhuma arte cadastrada no momento. Envie a sua imagem.</p>`}
      </fieldset>` : "";

    this.o.controles.innerHTML = `
      ${blocoArtes}
      <div class="grupo" data-bloco-upload ${regras.permiteArtes ? "hidden" : ""}>
        <span class="rotulo">${esc(regras.rotuloUpload || "Sua imagem")}${regras.uploadObrigatorio ? " (obrigatória)" : ""}</span>
        <input type="file" accept="${upload.tiposAceitos.join(",")}" class="sr-only" data-arquivo id="arquivo-${Math.random().toString(36).slice(2)}">
        <div class="zona-upload" data-zona>
          <button type="button" class="btn btn-escuro" data-escolher>Escolher imagem</button>
          <p>${esc(tipos)} até ${upload.tamanhoMaximoMB} MB.${regras.orientacaoUpload ? " " + esc(regras.orientacaoUpload) : ""}</p>
        </div>
        <div class="arquivo-info" data-info hidden>
          <span class="nome" data-nome></span>
          <button type="button" class="btn-texto" data-substituir>Substituir</button>
          <button type="button" class="btn-texto" data-remover>Remover</button>
        </div>
      </div>
      <div role="alert" data-erro></div>
      <div class="ajustes" data-ajustes hidden>
        <span class="rotulo">Ajustar composição</span>
        <div class="ajuste">
          <label for="zoom-${this.idBase = Math.random().toString(36).slice(2)}">Tamanho da imagem</label>
          <input type="range" id="zoom-${this.idBase}" min="1" max="${ZOOM_MAX}" step="0.01" value="1" data-zoom>
        </div>
        <div class="ajuste">
          <span>Posição <small>(ou arraste a imagem na prévia)</small></span>
          <div class="setas" role="group" aria-label="Mover imagem">
            <button type="button" data-mover="-1,0" aria-label="Mover para a esquerda">←</button>
            <button type="button" data-mover="0,-1" aria-label="Mover para cima">↑</button>
            <button type="button" data-mover="0,1" aria-label="Mover para baixo">↓</button>
            <button type="button" data-mover="1,0" aria-label="Mover para a direita">→</button>
          </div>
        </div>
        <div class="ajuste-linha">
          <button type="button" class="btn btn-contorno" data-restaurar>Restaurar composição</button>
        </div>
        <div data-qualidade></div>
      </div>`;

    this.canvas = this.o.previa.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.q = sel => this.o.controles.querySelector(sel);
    this.entrada = this.q("[data-arquivo]");

    this.o.previa.querySelector("[data-legenda]").textContent = this.o.legenda || "";
    this.o.previa.querySelector("[data-area]").addEventListener("change", e => { this.mostrarArea = e.target.checked; this.desenhar(); });

    this.o.controles.querySelectorAll("input[name=fonte]").forEach(r => r.addEventListener("change", () => this.trocarFonte(r.value)));
    this.o.controles.querySelectorAll("input[name=arte]").forEach(r => r.addEventListener("change", () => this.escolherArte(r.value)));
    this.q("[data-escolher]").addEventListener("click", () => this.entrada.click());
    this.q("[data-substituir]").addEventListener("click", () => this.entrada.click());
    this.q("[data-remover]").addEventListener("click", () => this.removerImagem());
    this.entrada.addEventListener("change", () => { const f = this.entrada.files[0]; this.entrada.value = ""; if (f) this.carregarArquivo(f); });
    this.q("[data-zoom]").addEventListener("input", e => { this.t.zoom = Number(e.target.value); this.limitarPosicao(); this.desenhar(); this.notificar(); });
    this.o.controles.querySelectorAll("[data-mover]").forEach(b => b.addEventListener("click", () => {
      const [dx, dy] = b.dataset.mover.split(",").map(Number); this.moverPasso(dx, dy);
    }));
    this.q("[data-restaurar]").addEventListener("click", () => { this.restaurar(); });

    const zona = this.q("[data-zona]");
    ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("arrastando"); }));
    ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("arrastando"); }));
    zona.addEventListener("drop", e => { const f = e.dataTransfer?.files?.[0]; if (f) this.carregarArquivo(f); });

    this.ligarGestos();
    this.observador = new ResizeObserver(() => this.desenhar());
    this.observador.observe(this.o.previa.querySelector(".previa-palco"));
    this.desenhar();
  }

  destruir() {
    this.observador?.disconnect();
    if (this.urlTemp) URL.revokeObjectURL(this.urlTemp);
  }

  trocarFonte(fonte) {
    this.fonte = fonte;
    this.q("[data-bloco-artes]")?.toggleAttribute("hidden", fonte !== "arte");
    this.q("[data-bloco-upload]").toggleAttribute("hidden", fonte !== "upload");
    this.mostrarErro("");
    if (fonte === "arte") {
      const marcada = this.o.controles.querySelector("input[name=arte]:checked");
      if (marcada) this.escolherArte(marcada.value); else this.definirImagem(null);
    } else {
      this.definirImagem(this.arquivo?.img || null);
    }
  }

  async escolherArte(id) {
    const arte = (this.o.artes || []).find(a => a.id === id);
    if (!arte) return;
    this.arte = arte;
    this.setCarregando(true);
    try {
      const img = await carregarImagem(arte.imagem);
      if (this.fonte === "arte" && this.arte === arte) this.definirImagem(img);
    } catch {
      this.mostrarErro("Não foi possível carregar esta arte. Tente outra ou envie a sua imagem.");
    } finally { this.setCarregando(false); }
  }

  async carregarArquivo(arquivo) {
    const { tiposAceitos, tamanhoMaximoMB } = this.o.upload;
    this.mostrarErro("");
    const tipoOk = tiposAceitos.includes(arquivo.type) || (!arquivo.type && /\.(jpe?g|png|webp)$/i.test(arquivo.name));
    if (!tipoOk) {
      this.mostrarErro(`O arquivo "${arquivo.name}" não é uma imagem aceita. Envie JPG, PNG ou WebP.`);
      return false;
    }
    if (arquivo.size > tamanhoMaximoMB * 1024 * 1024) {
      this.mostrarErro(`A imagem tem ${tamanhoMB(arquivo.size)} e o limite é ${tamanhoMaximoMB} MB. Envie uma versão menor.`);
      return false;
    }
    this.setCarregando(true);
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await carregarImagem(url);
      if (this.urlTemp) URL.revokeObjectURL(this.urlTemp);
      this.urlTemp = url;
      this.arquivo = { nome: arquivo.name, tamanho: arquivo.size, img };
      this.q("[data-zona]").hidden = true;
      this.q("[data-info]").hidden = false;
      this.q("[data-nome]").textContent = arquivo.name;
      this.definirImagem(img);
      return true;
    } catch {
      URL.revokeObjectURL(url);
      this.mostrarErro("Não conseguimos abrir esta imagem. O arquivo pode estar corrompido. Tente outra foto.");
      return false;
    } finally { this.setCarregando(false); }
  }

  removerImagem() {
    if (this.urlTemp) URL.revokeObjectURL(this.urlTemp);
    this.urlTemp = null;
    this.arquivo = null;
    this.q("[data-zona]").hidden = false;
    this.q("[data-info]").hidden = true;
    this.definirImagem(null);
  }

  definirImagem(img) {
    this.imagem = img;
    this.restaurar(false);
    this.q("[data-ajustes]").hidden = !img;
    this.desenhar();
    this.notificar();
  }

  restaurar(notificar = true) {
    this.t = { zoom: 1, x: 0.5, y: 0.5 };
    const z = this.q("[data-zoom]"); if (z) z.value = "1";
    this.desenhar();
    if (notificar) this.notificar();
  }

  setCarregando(v) {
    this.carregando = v;
    this.o.previa.querySelector(".carregando").hidden = !v;
  }

  mostrarErro(msg) {
    this.erro = msg;
    const el = this.q("[data-erro]");
    el.innerHTML = msg ? `<p class="aviso aviso-erro">${esc(msg)}</p>` : "";
  }

  notificar() {
    this.atualizarQualidade();
    this.o.aoMudar?.(this.estado());
  }

  /** Situação atual, para a página decidir se pode adicionar ao carrinho. */
  estado() {
    const temImagem = !!this.imagem;
    let pendencia = "";
    if (!temImagem) {
      if (this.o.regras.uploadObrigatorio) pendencia = this.o.regras.mensagemSemUpload || "Envie uma imagem para continuar.";
      else if (this.fonte === "arte") pendencia = "Escolha uma das artes da loja.";
      else if (this.fonte === "upload") pendencia = "Envie a sua imagem ou escolha uma arte da loja.";
      else pendencia = "Escolha uma arte da loja ou envie a sua imagem.";
    }
    return {
      pronto: temImagem && !this.carregando,
      pendencia,
      fonte: this.fonte,
      arte: this.fonte === "arte" && this.arte ? { id: this.arte.id, nome: this.arte.nome } : null,
      arquivo: this.fonte === "upload" && this.arquivo ? { nome: this.arquivo.nome, tamanho: this.arquivo.tamanho } : null,
      ajuste: { ...this.t },
      qualidadeBaixa: this.qualidadeBaixa,
    };
  }

  // ---------- Geometria ----------
  /** Escala para a imagem cobrir uma área w×h (recorte) multiplicada pelo zoom. */
  escala(w, h) {
    const img = this.imagem;
    return Math.max(w / img.naturalWidth, h / img.naturalHeight) * this.t.zoom;
  }

  limitarPosicao() {
    if (!this.imagem) return;
    const W = 1000, H = W * this.dims.alturaCm / this.dims.larguraCm;
    const s = this.escala(W, H);
    const meiaW = W / s / 2 / this.imagem.naturalWidth;
    const meiaH = H / s / 2 / this.imagem.naturalHeight;
    this.t.x = Math.min(1 - meiaW, Math.max(meiaW, this.t.x));
    this.t.y = Math.min(1 - meiaH, Math.max(meiaH, this.t.y));
  }

  moverPasso(dx, dy) {
    if (!this.imagem) return;
    const passo = 0.03 / this.t.zoom;
    this.t.x += dx * passo; this.t.y += dy * passo;
    this.limitarPosicao(); this.desenhar(); this.notificar();
  }

  /** Desenha a composição num contexto de tamanho w×h. */
  compor(ctx, w, h) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (!this.imagem) return;
    const img = this.imagem;
    const s = this.escala(w, h);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const dx = w / 2 - this.t.x * dw, dy = h / 2 - this.t.y * dh;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  desenhar() {
    const palco = this.o.previa.querySelector(".previa-palco");
    const larguraCss = Math.max(200, palco.clientWidth || 600);
    const prop = this.dims.alturaCm / this.dims.larguraCm;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(larguraCss * dpr), h = Math.round(larguraCss * prop * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.ctx;
    this.compor(ctx, w, h);
    const pxCm = w / this.dims.larguraCm;

    if (!this.imagem) {
      ctx.fillStyle = "#F3F4F6"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#4B5563";
      ctx.font = `600 ${Math.round(14 * dpr)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const texto = this.o.regras.permiteArtes ? "Escolha uma arte ou envie sua imagem" : "Envie a foto para ver a prévia";
      ctx.fillText(texto, w / 2, h / 2 - 10 * dpr);
      ctx.font = `${Math.round(13 * dpr)}px Inter, system-ui, sans-serif`;
      ctx.fillText(this.dims.rotulo || `${this.dims.larguraCm} × ${this.dims.alturaCm} cm`, w / 2, h / 2 + 14 * dpr);
    }

    if (this.o.moldura) ctx.drawImage(this.o.moldura, 0, 0, w, h);

    if (this.mostrarArea) {
      const m = MARGEM_SEGURANCA_CM * pxCm;
      ctx.save();
      ctx.setLineDash([8 * dpr, 6 * dpr]);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineDashOffset = 7 * dpr;
      ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
      ctx.restore();
    }
  }

  atualizarQualidade() {
    const el = this.q("[data-qualidade]");
    this.qualidadeBaixa = false;
    if (!el) return;
    if (!this.imagem || this.fonte !== "upload") { el.innerHTML = ""; return; }
    const W = 1000, H = W * this.dims.alturaCm / this.dims.larguraCm;
    const pxPorCm = W / this.escala(W, H) / this.dims.larguraCm;
    const minimo = this.o.upload.pixelsPorCmMinimo || 40;
    this.qualidadeBaixa = pxPorCm < minimo;
    el.innerHTML = this.qualidadeBaixa
      ? `<p class="aviso aviso-alerta"><strong>A imagem pode ficar sem nitidez.</strong>Ela tem poucos pixels para este tamanho. Se puder, envie uma foto maior ou diminua o zoom.</p>`
      : "";
  }

  // ---------- Gestos: arrastar, pinça e teclado ----------
  ligarGestos() {
    const c = this.canvas;
    const ponteiros = new Map();
    let inicio = null;

    c.addEventListener("pointerdown", e => {
      if (!this.imagem) return;
      c.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      inicio = { t: { ...this.t }, pts: new Map(ponteiros) };
    });
    c.addEventListener("pointermove", e => {
      if (!ponteiros.has(e.pointerId) || !this.imagem) return;
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = c.getBoundingClientRect();
      if (ponteiros.size === 1 && inicio.pts.has(e.pointerId)) {
        const p0 = inicio.pts.get(e.pointerId);
        const s = this.escala(rect.width, rect.height);
        this.t.x = inicio.t.x - (e.clientX - p0.x) / s / this.imagem.naturalWidth;
        this.t.y = inicio.t.y - (e.clientY - p0.y) / s / this.imagem.naturalHeight;
      } else if (ponteiros.size === 2 && inicio.pts.size === 2) {
        const [a, b] = [...ponteiros.values()];
        const [a0, b0] = [...inicio.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
        this.t.zoom = Math.min(ZOOM_MAX, Math.max(1, inicio.t.zoom * d / d0));
        this.q("[data-zoom]").value = String(this.t.zoom);
      }
      this.limitarPosicao();
      this.desenhar();
    });
    const soltar = e => {
      if (!ponteiros.delete(e.pointerId)) return;
      inicio = { t: { ...this.t }, pts: new Map(ponteiros) };
      this.notificar();
    };
    c.addEventListener("pointerup", soltar);
    c.addEventListener("pointercancel", soltar);

    c.addEventListener("keydown", e => {
      if (!this.imagem) return;
      const mapa = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (mapa[e.key]) { e.preventDefault(); this.moverPasso(...mapa[e.key]); }
      else if (e.key === "+" || e.key === "=" || e.key === "-") {
        e.preventDefault();
        this.t.zoom = Math.min(ZOOM_MAX, Math.max(1, this.t.zoom + (e.key === "-" ? -0.1 : 0.1)));
        this.q("[data-zoom]").value = String(this.t.zoom);
        this.limitarPosicao(); this.desenhar(); this.notificar();
      }
    });
  }

  // ---------- Exportação ----------
  /** Gera a imagem final (área de impressão) e uma miniatura para o carrinho. */
  async exportar() {
    if (!this.imagem) throw new Error("sem imagem");
    const largura = Math.min(LARGURA_MAX_PRODUCAO, Math.round(this.dims.larguraCm * PX_POR_CM_PRODUCAO));
    const altura = Math.round(largura * this.dims.alturaCm / this.dims.larguraCm);
    const tela = document.createElement("canvas");
    tela.width = largura; tela.height = altura;
    const ctx = tela.getContext("2d");
    this.compor(ctx, largura, altura);
    if (this.o.moldura) ctx.drawImage(this.o.moldura, 0, 0, largura, altura);
    const blob = await new Promise((ok, falha) => tela.toBlob(b => (b ? ok(b) : falha(new Error("toBlob"))), "image/jpeg", 0.9));

    const mini = document.createElement("canvas");
    mini.width = 240; mini.height = Math.round(240 * altura / largura);
    mini.getContext("2d").drawImage(tela, 0, 0, mini.width, mini.height);
    const miniatura = mini.toDataURL("image/jpeg", 0.75);
    return { blob, miniatura, largura, altura };
  }
}

export function carregarImagem(url) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => (img.naturalWidth && img.naturalHeight ? ok(img) : falha(new Error("vazia")));
    img.onerror = () => falha(new Error("falha ao carregar"));
    img.src = url;
  });
}
