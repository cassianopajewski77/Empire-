// Substituto do módulo "cloudflare:workers" para rodar o servidor no Node nos testes.
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
