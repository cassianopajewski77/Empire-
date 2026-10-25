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
- **Logo.** Usei a logo enviada pelo Cassiano no cabeçalho, no rodapé e nos ícones (favicon e tela inicial do celular).
- **Tamanhos dos mousepads.** Usei P, M e G, que já tinham sido definidos antes neste projeto. O "não inventar dimensões" do documento foi respeitado: nenhuma outra medida, espessura ou material novo foi criado.
- **Artes prontas.** Fiz quatro artes de demonstração a partir do croqui (Neon Gamer, Alviverde Coxa, Céu Pastel e Abstrato Empire). A do Coritiba usa só as cores e o apelido, sem o escudo, que é marca registrada.

## 3. O que está em modo de demonstração ou a definir

| Item | Situação no site |
| --- | --- |
| Preços | Todos `null`: aparece "Preço a definir" e o total fica "A definir". |
| Pagamento Pix | Modo `demonstracao`: o site avisa que o pagamento não está configurado. Não gera QR Code nem mostra chave, e nunca marca pagamento como confirmado. |
| Pix manual | Pronto para ligar em `public/data/loja.json` (`modo: "manual"` + chave e titular). Mesmo assim, o pedido continua "Aguardando pagamento" até a loja conferir. |
| Envio do pedido | WhatsApp configurado: (41) 99690-7357. Depois de confirmar, o cliente toca em "Enviar pedido pelo WhatsApp" e anexa as imagens baixadas. Sem número, o site avisaria que o pedido **não foi enviado**. |
| Frete e prazo | "Entrega a combinar." até configurar `entrega` em `public/data/loja.json`. |
| Modelos Clássico e Divertido | Sem descrição, imagem de referência e preço: o site mostra "Descrição em breve" e "Imagem de referência em breve". Cada modelo tem `previa.moldura` para receber uma imagem de moldura que aparece na prévia. |
| Estoque | Não há controle de quantidade. Existe só o campo `disponibilidade` (`sob_encomenda`, `pronta_entrega`, `indisponivel`). |

## 4. Status de pedido

`public/js/pedidos.js` define os status (Aguardando pagamento, Pagamento confirmado, Em produção, Pronto para envio, Enviado, Entregue, Cancelado), as transições permitidas e a regra de que "Pagamento confirmado" só vale quando vem do provedor de pagamento ou de uma conferência manual. Um clique do cliente nunca confirma. Como não há backend, o site só cria pedidos em "Aguardando pagamento".

## 5. Privacidade e segurança

- As fotos são processadas no navegador e não vão para nenhum servidor deste site.
- Nenhuma credencial existe no código. Os JSON públicos avisam para não colocar segredos.
- Os textos do cliente são escapados antes de aparecer na tela, e os arquivos enviados são validados por tipo (JPEG, PNG, WebP), tamanho (15 MB, configurável) e leitura real da imagem.
- A página de privacidade descreve o funcionamento real e não afirma conformidade com a LGPD.

## 6. Limitações atuais (importante)

1. **Os pedidos não são salvos em servidor.** O resumo e as imagens ficam no navegador do cliente até ele enviar para a loja. Se o cliente limpar o navegador antes de enviar, o pedido se perde.
2. **O WhatsApp não carrega imagens pelo link.** O cliente precisa anexar as imagens baixadas na conversa.
3. **Não há painel administrativo** para ver ou mudar o status dos pedidos.

## 7. O que é preciso para vender de verdade

1. Definir os preços (`public/data/catalogo.json`).
2. Decidir o pagamento: Pix manual (mais simples) ou um provedor com Pix. A conta e o contrato precisam estar no nome de um adulto responsável, porque o Murilo é menor de idade.
3. Para pedidos guardados com segurança: um backend (por exemplo, Cloudflare Pages Functions) com banco de dados (D1) e armazenamento privado das imagens (R2), um painel protegido por senha para a loja, e o webhook autenticado do provedor de pagamento para confirmar o Pix no servidor.
4. Cadastrar descrição, preço e imagem de referência dos Modelos Clássico e Divertido.
5. Revisar a política de privacidade quando os dados passarem a ser guardados em servidor.

## 8. Testes

`npm test` roda 12 cenários no Chromium em tela de celular:

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
12. Nenhum erro de JavaScript.

Resultado em 25/10/2026: 12 de 12 passaram.

A especificação recebida terminou no "Cenário 7 — Arquivo inválido". Se havia mais cenários ou seções depois disso, eles ainda não foram implementados.
