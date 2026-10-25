# Mats & Mouse Pads Empire

Loja online de mousepads personalizados e tapetes pet (cães e gatos) com a foto do animal.
Site estático em HTML, CSS e JavaScript puro, sem etapa de build, publicado pela Cloudflare Pages.

## Como rodar no computador

```bash
npm start          # abre em http://localhost:8080
npm test           # testes de ponta a ponta (precisa do pacote playwright com o Chromium)
```

## Publicação (Cloudflare Pages)

- Framework preset: **None**
- Build command: *(vazio)*
- Build output directory: `/`

Todo push no `main` atualiza o site.

## O que editar sem programar

| Arquivo | Para quê |
| --- | --- |
| `data/catalogo.json` | Produtos, modelos, preços, dimensões, disponibilidade, artes prontas. `preco: null` aparece como "Preço a definir". `publicado: false` esconde o item. |
| `data/loja.json` | Limite de upload, entrega/frete, modo de pagamento, WhatsApp que recebe os pedidos. |
| `assets/artes/` | Imagens das artes prontas dos mousepads (cadastre em `catalogo.json > artes`). |
| `css/estilos.css` | Cores oficiais em `:root` (`--color-primary`, `--color-black`, `--color-white`, `--color-gray-light`). |

Os JSON são públicos. Nunca coloque senhas, tokens ou chaves secretas neles.

## Estrutura

```
index.html            casca do site (cabeçalho, rodapé)
css/estilos.css       identidade visual e layout responsivo
js/app.js             rotas (#/...) e páginas
js/personalizador.js  componente reutilizável de upload e edição de imagem
js/carrinho.js        carrinho (cada personalização é um item separado)
js/pedidos.js         modelo do pedido e regras de status
js/imagens.js         guarda as imagens finais no navegador (IndexedDB)
js/dados.js           leitura do catálogo e da configuração
data/                 catálogo e configuração editáveis
tests/e2e.cjs         testes dos cenários de compra
docs/relatorio.md     decisões, limitações e próximos passos
```

Veja `docs/relatorio.md` para as decisões tomadas e o que falta para vender de verdade.
