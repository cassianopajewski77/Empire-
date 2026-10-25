// Faz o Node encontrar "cloudflare:workers" nos testes (node --import ./tests/suporte/registrar.mjs).
import { register } from "node:module";
register("./resolver.mjs", import.meta.url);
