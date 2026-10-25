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

const ofereceModelo = (item, modeloId) => !modeloId || !Array.isArray(item.modelos) || item.modelos.includes(modeloId);

/** Times publicados. Só os licenciados (com arte oficial) podem ser comprados. */
export function timesPublicados(catalogo) {
  const provisoria = catalogo.timesArteProvisoria || {};
  return (catalogo.times || []).filter(t => t.publicado !== false).map(t => {
    const oficial = t.licenciado === true && Boolean(t.imagem);
    return {
      ...t,
      oficial,
      imagem: oficial ? t.imagem : provisoria.imagem,
      miniatura: oficial ? t.miniatura || t.imagem : provisoria.miniatura || provisoria.imagem,
    };
  });
}

/**
 * Artes que o cliente pode escolher no personalizador. Com modeloId, só as
 * oferecidas naquele tamanho. Times licenciados entram como artes da coleção "Times".
 */
export function artesPublicadas(catalogo, modeloId) {
  const artes = (catalogo.artes || []).filter(a => a.publicado !== false && ofereceModelo(a, modeloId));
  const times = timesPublicados(catalogo)
    .filter(t => t.oficial && ofereceModelo(t, modeloId))
    .map(t => ({ id: `time-${t.id}`, nome: t.nome, colecao: "times", imagem: t.imagem, miniatura: t.miniatura, provisoria: false }));
  return [...artes, ...times];
}

export function nomeColecao(catalogo, id) {
  if (id === "times") return "Times";
  return (catalogo.colecoes || []).find(c => c.id === id)?.nome || "";
}

/** O cliente só pode comprar modelos que não estão indisponíveis. */
export function podeComprar(modelo) {
  return modelo && modelo.disponibilidade !== "indisponivel";
}
