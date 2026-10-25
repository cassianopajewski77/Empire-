export async function resolve(especificador, contexto, proximo) {
  if (especificador === "cloudflare:workers") return { url: new URL("./cloudflare-workers.mjs", import.meta.url).href, shortCircuit: true };
  return proximo(especificador, contexto);
}
