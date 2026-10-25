// Personalizador do comedouro: tapete que fica embaixo dos potes de água e
// ração, com o nome do pet (ou uma frase curta) e um tema de cores.
// Mesma interface do Personalizador de imagens: estado(), exportar(), destruir().
// A prévia mostra o tapete com os potes (ilustração) e sem eles; o arquivo de produção é só o tapete.

import { esc } from "./util.js";

const LARGURA_PRODUCAO = 1600;

/** Desenha uma patinha centrada em (x, y), com tamanho s e rotação r (radianos). */
function patinha(ctx, x, y, s, r, cor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(r);
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.ellipse(0, s * 0.18, s * 0.3, s * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  [[-0.34, -0.12, 0.11, 0.14], [-0.12, -0.34, 0.11, 0.15], [0.12, -0.34, 0.11, 0.15], [0.34, -0.12, 0.11, 0.14]].forEach(([dx, dy, rx, ry]) => {
    ctx.beginPath(); ctx.ellipse(dx * s, dy * s, rx * s, ry * s, 0, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function retanguloArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pote de inox visto de cima, só para a prévia. */
function pote(ctx, x, y, r, conteudo) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#f4f6f8"); g.addColorStop(0.7, "#b9c0c8"); g.addColorStop(1, "#7d858e");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
  const fundo = ctx.createRadialGradient(x + r * 0.2, y + r * 0.2, r * 0.05, x, y, r * 0.74);
  fundo.addColorStop(0, "#e9edf1"); fundo.addColorStop(1, "#a7afb8");
  ctx.fillStyle = fundo;
  ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, Math.PI * 2); ctx.fill();
  if (conteudo === "racao") {
    // grãos espalhados de forma fixa (mesma prévia a cada desenho)
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996, d = Math.sqrt(i / 70) * r * 0.66;
      ctx.fillStyle = i % 3 ? "#7a4a22" : "#9c6431";
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.08, r * 0.06, a, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.fillStyle = "rgba(120,190,230,.35)";
    ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

export class PersonalizadorComedouro {
  /**
   * @param {object} opcoes
   * @param {HTMLElement} opcoes.previa
   * @param {HTMLElement} opcoes.controles
   * @param {object} opcoes.regras personalizacao do produto: { temas, textoMax, rotuloTexto, dicaTexto }
   * @param {number} opcoes.proporcao largura ÷ altura do tapete
   * @param {boolean} [opcoes.proporcaoProvisoria] a medida ainda não foi definida
   * @param {string} [opcoes.legenda]
   * @param {string} [opcoes.notaPotes] aviso sobre os potes, vindo do cadastro
   * @param {Function} [opcoes.aoMudar]
   */
  constructor(opcoes) {
    this.o = opcoes;
    this.temas = opcoes.regras.temas || [];
    this.tema = this.temas[0] || null;
    this.texto = "";
    this.montar();
  }

  montar() {
    const { regras } = this.o;
    const max = regras.textoMax || 14;
    this.o.previa.innerHTML = `
      <div class="previa-box">
        <div class="previa-palco previas-comedouro">
          <figure><canvas data-com-potes role="img" aria-label="Prévia do tapete com os potes de água e ração em cima"></canvas><figcaption>Com os potes</figcaption></figure>
          <figure><canvas data-sem-potes role="img" aria-label="Prévia do tapete sozinho, sem os potes"></canvas><figcaption>Sem os potes</figcaption></figure>
        </div>
        <div class="previa-legenda"><span data-legenda></span><span>Potes só na ilustração</span></div>
        <p class="aviso-previa" data-aviso-previa><strong>Prévia ilustrativa.</strong> A peça impressa pode ter pequenas diferenças de cor e de enquadramento.${this.o.proporcaoProvisoria ? " A medida do tapete ainda será definida pela loja." : ""}</p>
        ${this.o.notaPotes ? `<p class="dica-artes" data-nota-potes>${esc(this.o.notaPotes)}</p>` : ""}
      </div>`;
    this.o.controles.innerHTML = `
      <div class="grupo campo">
        <label for="nome-pet"><span class="rotulo">${esc(regras.rotuloTexto || "Nome do pet")} (obrigatório)</span></label>
        <input type="text" id="nome-pet" data-texto maxlength="${max}" autocomplete="off" placeholder="Ex.: Miles" aria-describedby="dica-nome-pet">
        <div class="dica" id="dica-nome-pet"><span data-contagem>0</span>/${max} caracteres.${regras.dicaTexto ? " " + esc(regras.dicaTexto) : ""}</div>
      </div>
      ${this.temas.length ? `
      <fieldset class="grupo">
        <legend>Tema</legend>
        <div class="opcoes temas">${this.temas.map((t, i) => `
          <label class="opcao opcao-tema"><input type="radio" name="tema" value="${esc(t.id)}" ${i === 0 ? "checked" : ""}>
            <span class="amostra" aria-hidden="true" style="background:linear-gradient(180deg, ${esc(t.cores.fundo)} 62%, ${esc(t.cores.faixa)} 62%)"></span>
            <strong>${esc(t.nome)}</strong></label>`).join("")}</div>
      </fieldset>` : ""}`;

    this.telas = [
      { canvas: this.o.previa.querySelector("[data-com-potes]"), comPotes: true },
      { canvas: this.o.previa.querySelector("[data-sem-potes]"), comPotes: false },
    ];
    this.o.previa.querySelector("[data-legenda]").textContent = this.o.legenda || "";
    const entrada = this.o.controles.querySelector("[data-texto]");
    entrada.addEventListener("input", () => {
      // sem quebras de linha nem espaços repetidos
      this.texto = entrada.value.replace(/\s+/g, " ").slice(0, max);
      this.o.controles.querySelector("[data-contagem]").textContent = entrada.value.length;
      this.desenhar(); this.notificar();
    });
    this.o.controles.querySelectorAll("input[name=tema]").forEach(r => r.addEventListener("change", () => {
      this.tema = this.temas.find(t => t.id === r.value) || this.tema;
      this.desenhar(); this.notificar();
    }));
    this.observador = new ResizeObserver(() => this.desenhar());
    this.observador.observe(this.o.previa.querySelector(".previa-palco"));
    this.desenhar();
  }

  destruir() { this.observador?.disconnect(); }

  notificar() { this.o.aoMudar?.(this.estado()); }

  estado() {
    const texto = this.texto.trim();
    return {
      pronto: Boolean(texto) && Boolean(this.tema),
      pendencia: texto ? "" : "Digite o nome do seu pet ou uma frase curta.",
      fonte: "texto",
      texto,
      tema: this.tema ? { id: this.tema.id, nome: this.tema.nome } : null,
    };
  }

  /** Desenha o tapete num contexto w×h. Com potes, é a prévia; sem potes, o arquivo de produção. */
  compor(ctx, w, h, comPotes) {
    const c = this.tema?.cores || { fundo: "#3a3d42", faixa: "#23252a", patinhas: "#55595f", texto: "#ffffff", destaque: "#e7b98b" };
    ctx.clearRect(0, 0, w, h);
    retanguloArredondado(ctx, 0, 0, w, h, h * 0.07);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = c.fundo; ctx.fillRect(0, 0, w, h);
    // patinhas espalhadas em grade levemente desalinhada
    const passo = h * 0.2;
    for (let lin = 0, y = passo * 0.45; y < h * 0.72; y += passo * 0.8, lin++) {
      for (let x = passo * (lin % 2 ? 0.9 : 0.45); x < w - passo * 0.35; x += passo) {
        patinha(ctx, x, y, h * 0.075, ((lin * 7 + x) % 5 - 2) * 0.25, c.patinhas);
      }
    }
    // faixa do nome
    const fy = h * 0.72;
    ctx.fillStyle = c.faixa; ctx.fillRect(0, fy, w, h - fy);
    ctx.restore();
    // borda costurada
    ctx.save();
    ctx.setLineDash([h * 0.02, h * 0.015]);
    ctx.lineWidth = Math.max(1, h * 0.006);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    retanguloArredondado(ctx, h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06, h * 0.05);
    ctx.stroke();
    ctx.restore();

    const texto = this.texto.trim();
    const cy = fy + (h - fy) / 2;
    patinha(ctx, w * 0.1, cy, h * 0.11, -0.3, c.destaque);
    patinha(ctx, w * 0.9, cy, h * 0.11, 0.3, c.destaque);
    let tam = h * 0.16;
    ctx.font = `800 ${tam}px Inter, system-ui, sans-serif`;
    const larguraMax = w * 0.66;
    const medida = ctx.measureText(texto || "Nome do pet").width;
    if (medida > larguraMax) { tam *= larguraMax / medida; ctx.font = `800 ${tam}px Inter, system-ui, sans-serif`; }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = texto ? c.texto : "rgba(255,255,255,.45)";
    ctx.fillText(texto || "Nome do pet", w / 2, cy);

    if (comPotes) {
      pote(ctx, w * 0.3, h * 0.37, h * 0.27, "agua");
      pote(ctx, w * 0.7, h * 0.37, h * 0.27, "racao");
    }
  }

  desenhar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const { canvas, comPotes } of this.telas) {
      const larguraCss = Math.max(140, canvas.parentElement.clientWidth || 300);
      const w = Math.round(larguraCss * dpr), h = Math.round(larguraCss / this.o.proporcao * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      this.compor(canvas.getContext("2d"), w, h, comPotes);
    }
  }

  async exportar() {
    if (!this.estado().pronto) throw new Error("incompleto");
    const largura = LARGURA_PRODUCAO, altura = Math.round(LARGURA_PRODUCAO / this.o.proporcao);
    const tela = document.createElement("canvas");
    tela.width = largura; tela.height = altura;
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, largura, altura);
    this.compor(ctx, largura, altura, false);
    const blob = await new Promise((ok, falha) => tela.toBlob(b => (b ? ok(b) : falha(new Error("toBlob"))), "image/jpeg", 0.9));
    const mini = document.createElement("canvas");
    mini.width = 240; mini.height = Math.round(240 / this.o.proporcao);
    const m = mini.getContext("2d");
    m.fillStyle = "#ffffff"; m.fillRect(0, 0, mini.width, mini.height);
    this.compor(m, mini.width, mini.height, true);
    return { blob, miniatura: mini.toDataURL("image/jpeg", 0.8), largura, altura };
  }
}
