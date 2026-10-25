// Ambiente falso da Cloudflare para os testes: SQLite do Node no lugar do
// armazenamento do Durable Object.
import { DatabaseSync } from "node:sqlite";
import { Pedidos } from "../../src/pedidos-do.js";

function sqlFalso() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(consulta, ...valores) {
      if (!valores.length && consulta.split(";").filter(s => s.trim()).length > 1) { db.exec(consulta); return { toArray: () => [] }; }
      const st = db.prepare(consulta);
      const linhas = /^\s*(SELECT|WITH|PRAGMA)/i.test(consulta) ? st.all(...valores) : (st.run(...valores), []);
      return { toArray: () => linhas.map(l => ({ ...l })) };
    },
  };
}

/** Binding PEDIDOS falso: uma instância só, como na loja ("loja"). */
export function bancoFalso() {
  const instancia = new Pedidos({ storage: { sql: sqlFalso() } }, {});
  // Na Cloudflare, os dados passam por cópia entre o Worker e o Durable Object.
  const copia = v => (v === undefined ? v : structuredClone(v));
  const stub = new Proxy({}, { get: (_, nome) => async (...args) => copia(await instancia[nome](...args.map(copia))) });
  return { idFromName: () => "loja", get: () => stub, instancia };
}
