// Guarda as imagens finais das personalizações no próprio navegador (IndexedDB).
// Atenção: isto NÃO é um armazenamento permanente nem chega à loja. Serve apenas
// para o carrinho não perder as imagens enquanto o cliente navega neste aparelho.

const BANCO = "empire-imagens";
const LOJA = "imagens";
const memoria = new Map(); // reserva quando o IndexedDB não está disponível

function abrir() {
  return new Promise((ok, falha) => {
    if (!("indexedDB" in window)) return falha(new Error("sem indexedDB"));
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function op(modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(LOJA, modo);
    const r = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => { db.close(); ok(r?.result); };
    tx.onerror = () => { db.close(); falha(tx.error); };
  });
}

export async function salvarImagem(chave, blob) {
  try { await op("readwrite", s => s.put(blob, chave)); }
  catch { memoria.set(chave, blob); }
}

export async function lerImagem(chave) {
  if (memoria.has(chave)) return memoria.get(chave);
  try { return await op("readonly", s => s.get(chave)); } catch { return undefined; }
}

export async function apagarImagem(chave) {
  memoria.delete(chave);
  try { await op("readwrite", s => s.delete(chave)); } catch { /* nada a fazer */ }
}
