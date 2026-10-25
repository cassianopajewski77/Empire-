# Mats & Mouse Pads Empire

Loja online de mousepads personalizados e tapetes pet (cães e gatos) com a foto do animal.
Site estático em HTML, CSS e JavaScript puro, sem etapa de build, publicado pela Cloudflare (Workers Builds, só arquivos estáticos).

## Como rodar no computador

```bash
npm start          # abre em http://localhost:8080
npm test           # testes de ponta a ponta (precisa do pacote playwright com o Chromium)
```

## Publicação (Cloudflare)

O `wrangler.jsonc` publica a pasta `public/` e o servidor `src/worker.js`, que atende só as rotas `/api/*`: pedidos, Pix pelo Mercado Pago, aviso do Mercado Pago e painel da loja. Os pedidos ficam num Durable Object com SQLite (`src/pedidos-do.js`), criado sozinho no deploy. Todo push no `main` atualiza o site; os outros branches geram uma prévia.

### Token do Mercado Pago

1. No Mercado Pago: **Seu negócio → Configurações → Credenciais** (ou developers.mercadopago.com → Suas integrações). Copie o **Access Token de produção**.
2. Na Cloudflare: **Workers & Pages → empire → Settings → Variables and Secrets → Add**. Tipo **Secret**, nome `MP_ACCESS_TOKEN`, cole o token e salve.

Nunca coloque o token no código, nos JSON ou em mensagens.

Opcional, para validar o aviso do Mercado Pago: em **Suas integrações → Webhooks**, cadastre `https://empire.cassiano-pajewski.workers.dev/api/mercadopago/webhook` com o evento **Pagamentos**, copie a **assinatura secreta** e salve como segredo `MP_WEBHOOK_SECRET`. Sem isso o aviso continua funcionando, porque o servidor sempre confere o pagamento direto no Mercado Pago.

### Painel da loja

Endereço: `/painel.html` (não aparece no menu do site). Cadastre uma senha forte como segredo `ADMIN_SENHA`, do mesmo jeito do token. No painel dá para ver os pedidos, mudar o status, confirmar um Pix combinado pelo WhatsApp e lançar o rastreio. Depois de 10 senhas erradas, o painel bloqueia por 15 minutos.

### Mensagens automáticas no WhatsApp (Meta)

Sem esta configuração, o painel mostra o botão **Abrir no WhatsApp** com a mensagem pronta. Para enviar sozinho, um adulto responsável precisa:

1. Criar um portfólio empresarial em business.facebook.com e um app do tipo **Business** em developers.facebook.com com o produto **WhatsApp**.
2. Cadastrar e verificar o número que vai enviar as mensagens. Um número usado na API pode deixar de funcionar no app comum do WhatsApp; a Meta oferece um número de teste para começar.
3. Em **Modelos de mensagem**, criar dois modelos da categoria **Utilidade**, idioma **Português (BR)**, com estes nomes e textos:

   `pedido_pago`
   > Olá, {{1}}! Recebemos o seu pedido {{2}} e o pagamento foi confirmado com sucesso.
   > Espelho do pedido: {{3}}
   > Total: {{4}}
   > Entrega: {{5}}
   > Acompanhe a entrega por este WhatsApp: vamos avisar aqui quando o pedido for enviado, com o código de rastreio.
   > Mats & Mouse Pads Empire

   `pedido_enviado`
   > Olá, {{1}}! O seu pedido {{2}} foi enviado.
   > Transportadora: {{3}}
   > Código de rastreio: {{4}}
   > Acompanhe: {{5}}
   > Qualquer dúvida, fale com a gente por aqui. Mats & Mouse Pads Empire

4. Gerar um **token permanente** (usuário do sistema com permissão `whatsapp_business_messaging`) e copiar o **ID do número de telefone**.
5. Na Cloudflare, criar os segredos `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`.

A Meta cobra por mensagem de modelo enviada. Só recebe mensagem o cliente que marcou a opção no checkout. Os nomes dos modelos, o idioma e a versão da API ficam em `public/data/loja.json` (`notificacoes.whatsapp`).

## O que editar sem programar

| Arquivo | Para quê |
| --- | --- |
| `public/data/catalogo.json` | Produtos, modelos, preços, dimensões, disponibilidade, artes prontas. `preco: null` aparece como "Preço a definir". `publicado: false` esconde o item. |
| `public/data/loja.json` | Limite de upload, entrega/frete, modo de pagamento (`mercadopago`, `whatsapp`…), WhatsApp que recebe os pedidos. |
| `public/assets/artes/` | Imagens das artes prontas dos mousepads (cadastre em `catalogo.json > artes`). |
| `public/css/estilos.css` | Cores oficiais em `:root` (`--color-primary`, `--color-black`, `--color-white`, `--color-gray-light`). |

Os JSON são públicos. Nunca coloque senhas, tokens ou chaves secretas neles.

## Estrutura

```
public/               tudo o que vai para o ar
  index.html            casca do site (cabeçalho, rodapé)
  css/estilos.css       identidade visual e layout responsivo
  js/app.js             rotas (#/...) e páginas
  js/personalizador.js  componente reutilizável de upload e edição de imagem
  js/carrinho.js        carrinho (cada personalização é um item separado)
  js/pedidos.js         modelo do pedido e regras de status
  js/imagens.js         guarda as imagens finais no navegador (IndexedDB)
  js/dados.js           leitura do catálogo e da configuração
  data/                 catálogo e configuração editáveis
src/worker.js         servidor: cria e consulta o Pix no Mercado Pago
wrangler.jsonc        publicação na Cloudflare
tests/                testes do servidor e dos cenários de compra
docs/relatorio.md     decisões, limitações e próximos passos
```

Veja `docs/relatorio.md` para as decisões tomadas e o que falta para vender de verdade.
