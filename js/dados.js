// Carrega a configuração da loja e o catálogo (arquivos JSON em /data).

let cache;

export async function carregarDados() {
  if (cache) return cache;
  const [loja, catalogo] = await Promise.all([
    fetch("data/loja.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("loja"); return r.json(); }),
    fetch("data/catalogo.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("catalogo"); return r.json(); }),
  ]);
  cache = { loja, catalogo };
  return cache;
}

export function produtosPublicados(catalogo) {
  return catalogo.produtos
    .filter(p => p.publicado !== false)
    .map(p => ({ ...p, modelos: (p.modelos || []).filter(m => m.publicado !== false) }))
    .filter(p => p.modelos.length);
}

export function acharProduto(catalogo, produtoId) {
  return produtosPublicados(catalogo).find(p => p.id === produtoId);
}

export function acharModelo(produto, modeloId) {
  return produto?.modelos.find(m => m.id === modeloId);
}

export function artesPublicadas(catalogo) {
  return (catalogo.artes || []).filter(a => a.publicado !== false);
}

/** O cliente só pode comprar modelos que não estão indisponíveis. */
export function podeComprar(modelo) {
  return modelo && modelo.disponibilidade !== "indisponivel";
}
