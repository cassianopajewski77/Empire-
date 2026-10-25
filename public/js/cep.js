// Busca o endereço pelo CEP no ViaCEP (serviço público e gratuito, sem chave).
// Só o CEP é enviado; nenhum outro dado do cliente sai do navegador.

const cache = new Map();

/**
 * @returns {Promise<{rua:string, bairro:string, cidade:string, estado:string}|null>}
 *   null quando o CEP não existe. Lança erro se o serviço não responder.
 */
export async function buscarCep(cep) {
  const digitos = String(cep).replace(/\D/g, "");
  if (digitos.length !== 8) return null;
  if (cache.has(digitos)) return cache.get(digitos);
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 6000);
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: controle.signal });
    if (!resp.ok) throw new Error("viacep " + resp.status);
    const d = await resp.json();
    const endereco = d.erro ? null : { rua: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", estado: d.uf || "" };
    cache.set(digitos, endereco);
    return endereco;
  } finally {
    clearTimeout(limite);
  }
}

/** Formata enquanto o cliente digita: 80010000 → 80010-000. */
export function mascaraCep(valor) {
  const d = String(valor).replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
