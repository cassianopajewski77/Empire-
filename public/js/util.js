// Funções pequenas usadas em todo o site.

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata um valor em reais. null/undefined vira o texto de "a definir". */
export function brl(valor, textoIndefinido = "Preço a definir") {
  return typeof valor === "number" && Number.isFinite(valor) ? fmtBRL.format(valor) : textoIndefinido;
}

/** Escapa texto para inserir com segurança em HTML. */
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function uid(prefixo = "") {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefixo + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36);
}

/** Lê do localStorage sem quebrar quando ele está bloqueado. */
export function lerLocal(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
export function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
}

let toastTimer;
/** Mostra uma mensagem curta no rodapé da tela (lida por leitores de tela). */
export function avisar(msg) {
  const t = document.querySelector(".toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

export const DISPONIBILIDADE = {
  sob_encomenda: "Sob encomenda",
  pronta_entrega: "Pronta entrega",
  indisponivel: "Indisponível no momento",
};

export function tamanhoMB(bytes) {
  return (bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
}
