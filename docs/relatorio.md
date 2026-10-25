# Relatório da implementação: loja Mats & Mouse Pads Empire

Data: 25/10/2026

## 1. O que existia

O repositório tinha uma única página (`index.html`) feita para a feira da escola: o cliente escolhia tamanho e modelo, e o pedido abria pronto no WhatsApp. Não havia framework, backend, banco de dados, autenticação, integração de pagamento nem armazenamento de arquivos. Os preços, o WhatsApp e a chave Pix eram provisórios.

## 2. Decisões técnicas

- **Continuar estático, sem framework e sem build.** É o mais simples e seguro e não exige instalar nada. O projeto da Cloudflare foi criado como Worker, então o `wrangler.jsonc` publica a pasta `public/` só como arquivos estáticos, sem código de servidor. O site virou uma aplicação de página única com rotas por `#/`.
- **Catálogo e configuração em JSON (`public/data/`).** Produtos, preços, dimensões, artes, entrega e pagamento mudam editando um arquivo, sem mexer no código nem reconstruir páginas.
- **Componente único de personalização** (`public/js/personalizador.js`), configurado por produto:
  - Mousepad: `arte_ou_upload`. O envio de imagem é opcional e o cliente pode escolher uma arte pronta.
  - Tapete pet: `upload_obrigatorio`. A foto é obrigatória e não aparecem artes prontas.
- **Prévia no formato real.** O desenho respeita a proporção de cada produto (P 22 × 18, M 30 × 25, G 90 × 40, pet 40 × 60 cm), com cantos arredondados e uma linha tracejada de margem de segurança (1 cm). A imagem sempre cobre o produto inteiro, e a área visível é o recorte. Ferramentas: tamanho (zoom), arrastar, pinça no celular, setas na tela e no teclado, restaurar, substituir e remover.
- **Imagem de produção.** Ao adicionar ao carrinho, o site gera a imagem final recortada em até 4000 px de largura (cerca de 50 px por cm) e uma miniatura. A imagem fica no IndexedDB do navegador, e a miniatura e os dados do item ficam no localStorage.
- **Aviso de qualidade.** Se a foto tiver menos de 40 px por cm na área usada (cerca de 100 dpi, valor configurável), o site avisa que a impressão pode ficar sem nitidez.
- **Carrinho.** Cada personalização recebe um id próprio, então dois mousepads iguais com imagens diferentes ficam como itens separados. No carrinho o preço acompanha o catálogo. No pedido, o preço é copiado no momento da confirmação e não muda depois.
- **Checkout sem conta**, com validação de nome, telefone com DDD, e-mail (opcional), CEP de 8 dígitos e UF, mais etapa de revisão com "Corrigir dados" e "Alterar produtos".
- **CEP automático.** Ao digitar os 8 números do CEP, o checkout consulta o ViaCEP (serviço público, sem chave) e preenche rua, bairro, cidade e estado. Só o CEP é enviado. Se o CEP não existir ou o serviço falhar, o cliente preenche à mão.
- **Logo.** Usei a logo enviada pelo Cassiano no cabeçalho, no rodapé e nos ícones (favicon e tela inicial do celular).
- **Tamanhos dos mousepads.** Usei P, M e G, que já tinham sido definidos antes neste projeto. O "não inventar dimensões" do documento foi respeitado: nenhuma outra medida, espessura ou material novo foi criado.
- **Artes prontas.** Fiz quatro artes de demonstração a partir do croqui (Neon Gamer, Alviverde Coxa, Céu Pastel e Abstrato Empire). A do Coritiba usa só as cores e o apelido, sem o escudo, que é marca registrada.

## 3. O que está em modo de demonstração ou a definir

| Item | Situação no site |
| --- | --- |
| Preços | Definidos pelo Cassiano em 25/10/2026: mousepad P R$ 19,90, M R$ 24,90, G R$ 109,90; tapete pet R$ 69,90 (Clássico e Divertido). |
| Pagamento Pix | Modo `mercadopago` (escolha do Cassiano): o servidor da loja (`src/worker.js`) cria a cobrança Pix no Mercado Pago com o valor calculado a partir do catálogo, e o site mostra o QR Code e o copia e cola. A página consulta o status pelo servidor e marca "Pagamento confirmado" só quando o Mercado Pago responde `approved`. Sem o segredo `MP_ACCESS_TOKEN` ou sem preço definido, o site avisa e manda combinar pelo WhatsApp. |
| Pix manual | Pronto para ligar em `public/data/loja.json` (`modo: "manual"` + chave e titular). Mesmo assim, o pedido continua "Aguardando pagamento" até a loja conferir. |
| Envio do pedido | O pedido é registrado no servidor da loja e aparece no painel. O cliente ainda envia as imagens pelo WhatsApp (41) 99690-7357. |
| Frete e prazo | "Entrega a combinar." até configurar `entrega` em `public/data/loja.json`. |
| Modelos Clássico e Divertido | Sem descrição, imagem de referência e preço: o site mostra "Descrição em breve" e "Imagem de referência em breve". Cada modelo tem `previa.moldura` para receber uma imagem de moldura que aparece na prévia. |
| Estoque | Não há controle de quantidade. Existe só o campo `disponibilidade` (`sob_encomenda`, `pronta_entrega`, `indisponivel`). |

## 4. Status de pedido

`public/js/pedidos.js` define os status (Aguardando pagamento, Pagamento confirmado, Em produção, Pronto para envio, Enviado, Entregue, Cancelado), as transições permitidas e a regra de que "Pagamento confirmado" só vale quando vem do provedor de pagamento ou de uma conferência manual. Um clique do cliente nunca confirma. O site cria pedidos em "Aguardando pagamento"; as outras mudanças acontecem no servidor (Mercado Pago) ou no painel da loja.

## 5. Privacidade e segurança

- As fotos são processadas no navegador e não vão para nenhum servidor deste site. Os dados do pedido (nome, telefone, e-mail, endereço, itens) ficam no servidor da loja, acessíveis só pelo painel com senha.
- Nenhuma credencial existe no código. Os JSON públicos avisam para não colocar segredos.
- Os textos do cliente são escapados antes de aparecer na tela, e os arquivos enviados são validados por tipo (JPEG, PNG, WebP), tamanho (15 MB, configurável) e leitura real da imagem.
- A página de privacidade descreve o funcionamento real e não afirma conformidade com a LGPD.

## 5.1 Pix pelo Mercado Pago

- `POST /api/pedidos` registra o pedido no servidor. O preço vem do catálogo no servidor, nunca do navegador, e o cliente recebe uma chave secreta para acompanhar o pedido.
- `POST /api/pix` cria a cobrança com o valor guardado. A chave de idempotência (`código-tentativa`) impede cobrança em dobro.
- A confirmação acontece no servidor de dois jeitos: pelo aviso do Mercado Pago (`/api/mercadopago/webhook`, mesmo com a página fechada) ou pela consulta da página do pedido. Nos dois casos o servidor consulta o pagamento direto no Mercado Pago e confere o valor.
- O token fica no segredo `MP_ACCESS_TOKEN` da Cloudflare. A assinatura do aviso é conferida quando existe o segredo `MP_WEBHOOK_SECRET`.

## 5.2 Painel e mensagens no WhatsApp

- Os pedidos ficam num Durable Object com SQLite da Cloudflare (`src/pedidos-do.js`), que não exige criar banco no painel.
- `/painel.html`, protegido pelo segredo `ADMIN_SENHA` (bloqueio de 15 minutos depois de 10 senhas erradas): lista com filtro por status, detalhes do pedido, mudança de status seguindo as transições permitidas, confirmação manual de Pix combinado pelo WhatsApp, rastreio (transportadora, código e link) e histórico.
- Quando o pagamento é confirmado, o cliente recebe o espelho do pedido. Quando a loja lança o rastreio, recebe o código. O envio é automático pelo WhatsApp Cloud API da Meta (segredos `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`, modelos `pedido_pago` e `pedido_enviado`). Sem isso, o painel mostra o botão "Abrir no WhatsApp" com a mensagem pronta.
- Só recebe mensagem quem marca a opção no checkout. Cada tentativa fica anotada no pedido.

## 6. Limitações atuais (importante)

1. **As imagens personalizadas não vão para o servidor.** Elas ficam no navegador do cliente, que envia pelo WhatsApp. Guardá-las no servidor exigiria um armazenamento de arquivos (R2).
2. **Mensagens automáticas dependem da Meta.** Até a conta e os modelos serem aprovados, o envio é pelo botão do painel.
3. **Não há prazo de retenção definido** para os dados dos pedidos. A loja apaga a pedido do cliente.

## 7. O que é preciso para vender de verdade

1. Cadastrar na Cloudflare os segredos `MP_ACCESS_TOKEN` e `ADMIN_SENHA` (contas do Cassiano, adulto responsável).
2. Para o envio automático: conta da Meta, modelos aprovados e os segredos `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` (passo a passo no README).
3. Cadastrar descrição e imagem de referência dos Modelos Clássico e Divertido.

## 8. Testes

`npm test` roda 13 testes do servidor (`tests/worker.test.mjs`) e 16 cenários no Chromium em tela de celular:

1. Página inicial com marca, chamadas e categorias.
2. Mousepad com arte pronta, sem enviar imagem.
3. Mousepad com imagem própria, zoom, setas e arrastar.
4. Tapete pet sem foto: o site bloqueia e mostra a mensagem.
5. Tapete pet com foto, incluindo a troca da foto antes de adicionar.
6. Dois mousepads iguais com imagens diferentes ficam separados, e mudar um não altera o outro.
7. Quantidades recalculam subtotal e total (com preço de teste injetado só no teste).
8. Arquivo inválido, grande demais ou corrompido é recusado com mensagem.
9. Remover itens até o carrinho ficar vazio.
10. Checkout valida os campos, mantém os dados ao voltar e cria o pedido em "Aguardando pagamento", sem confirmar pagamento.
11. Nenhuma página tem rolagem horizontal no celular.
12. CEP preenche o endereço (com o ViaCEP simulado), avisa CEP inexistente e CEP geral de cidade.
13. Pix pelo Mercado Pago (simulado): e-mail obrigatório, QR Code com o valor do servidor, sem cobrança duplicada ao recarregar, e confirmação automática quando o pagamento é aprovado.
14. Pix sem preço definido: avisa e manda combinar pelo WhatsApp.
15. Painel: senha, confirmação manual, rastreio, mensagens no WhatsApp (simuladas) e rastreio na página do cliente.
16. Nenhum erro de JavaScript.

Resultado em 25/10/2026: 13 de 13 e 16 de 16 passaram.

A especificação recebida terminou no "Cenário 7 — Arquivo inválido". Se havia mais cenários ou seções depois disso, eles ainda não foram implementados.
