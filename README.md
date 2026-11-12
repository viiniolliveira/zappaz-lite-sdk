# Zappaz Lite SDK

SDK TypeScript para integrar mensagens, mídias, grupos e webhooks da **Zappaz Lite**. Usa `fetch` nativo, não tem dependências de execução e não exige framework nem abre um servidor automaticamente.

**Versão inicial experimental:** os testes usam fixtures e servidores locais; a integração com uma sessão WhatsApp real deve ser validada antes de produção. O SDK depende de uma API Zappaz Lite acessível, uma sessão existente e uma API Key autorizada. Não inclui a criação de sessão nem o servidor Zappaz.

## Conteúdo

- [Instalação](#instalação)
- [Envio rápido](#envio-rápido)
- [Configuração](#configuração)
- [Exemplos principais](#exemplos-principais)
- [Recebimento de mensagens por webhook com Hono](#recebimento-de-mensagens-por-webhook-com-hono)
- [Outros eventos](#outros-eventos)
- [Erros, timeout e cancelamento](#erros-timeout-e-cancelamento)
- [Referência dos métodos](docs/API.md)
- [Contratos dos webhooks](WEBHOOKS.md)
- [Compatibilidade e desenvolvimento](#compatibilidade-e-desenvolvimento)

## Instalação

```sh
bun add @zappaz/zappaz-lite-sdk
```

O pacote é **ESM** e publica JavaScript compilado e declarações TypeScript. Use somente no servidor: nunca exponha API Keys no frontend.

## Envio rápido

Configure as variáveis de ambiente no seu projeto, sem versionar os valores reais:

```dotenv
ZAPPAZ_BASE_URL=https://sua-api.example.com
ZAPPAZ_API_KEY=SUBSTITUA_PELA_CHAVE
ZAPPAZ_SESSION_ID=SUBSTITUA_PELA_SESSAO
ZAPPAZ_WEBHOOK_SECRET=SUBSTITUA_PELO_SEGREDO
```

`baseUrl` é a origem da API, sem acrescentar `/api/v1`. Localmente ela pode ser `http://localhost:3001`. Em produção, use HTTPS.

```ts
import { Zappaz } from '@zappaz/zappaz-lite-sdk'

const zappaz = new Zappaz({
  baseUrl: process.env.ZAPPAZ_BASE_URL!,
  apiKey: process.env.ZAPPAZ_API_KEY!,
  sessionId: process.env.ZAPPAZ_SESSION_ID!,
  timeoutMs: 10000,
})

await zappaz.messages.sendText({
  number: '5511999999999',
  message: 'Seu pedido foi confirmado!',
})
```

Somente enviar mensagens não exige `webhookSecret`. Use uma instância por sessão. Um envio aceito pela API não garante entrega final ao destinatário.

## Configuração

| Opção | Uso |
| --- | --- |
| `baseUrl` | Obrigatória. URL HTTP/HTTPS da API, sem credenciais, query ou fragmento. Pode incluir um prefixo de proxy antes de `/api/v1`. |
| `apiKey` | Obrigatória. Enviada como `x-api-key`; prefira uma chave restrita à sessão. |
| `sessionId` | Obrigatória. Identificador da sessão existente; segmentos de path são codificados pelo SDK. |
| `timeoutMs` | Prazo opcional por requisição, incluindo leitura da resposta. Inteiro de 1 a 2147483647 ms; sem valor, não há prazo próprio do SDK. |
| `webhookSecret` | Segredo igual ao cadastrado no webhook da Zappaz; de 1 a 2048 caracteres ASCII visíveis, sem espaços. |
| `authenticateWebhook` | Função opcional `(request: Request) => boolean \| Promise<boolean>`. Não consuma o corpo nela. |
| `maxWebhookBytes` | Limite do corpo recebido, padrão 1 MiB. |
| `onWebhookError` | Observador opcional de falhas dos handlers, inclusive lotes de debounce, e do logger personalizado. |
| `logWebhookPayloads` | Opcional, padrão `false`. Exibe envelopes validados no terminal; pode revelar dados pessoais. |
| `onWebhookPayload` | Callback opcional para logger personalizado; recebe uma cópia do envelope e substitui o log no console. |
| `fetch` | Implementação opcional de Fetch para testes ou transporte personalizado. Deve respeitar cancelamento e `redirect: 'error'`. |

O receptor exige `webhookSecret` ou `authenticateWebhook`. Se fornecer os dois, ambos precisam aprovar a requisição.

## Exemplos principais

Os trechos abaixo reutilizam a instância `zappaz` do exemplo inicial. Valores de número, ID, JID e URL são ilustrativos.

### Imagens e documentos

```ts
await zappaz.messages.sendImage({
  number: '5511999999999',
  source: 'https://example.com/foto.jpg',
  caption: 'Confira a foto!',
})

await zappaz.messages.sendDocument({
  number: '5511999999999',
  source: 'https://example.com/pedido.pdf',
  fileName: 'pedido.pdf',
  caption: 'Resumo do pedido',
})
```

`source` também aceita base64 ou data URL. As URLs precisam ser públicas e atender à política de saída do servidor. Os uploads são JSON, não multipart. A API controla os limites; o padrão de mídia é 25 MiB decodificados. Há também `sendVideo`, `sendAudio`, `sendContact` e `sendLocation`.

### Editar e excluir mensagens

```ts
await zappaz.messages.editText('ID_WHATSAPP_DA_MENSAGEM', {
  text: 'Seu pedido já saiu para entrega!',
})

await zappaz.messages.deleteForEveryone('ID_WHATSAPP_DA_MENSAGEM')
```

Use o ID WhatsApp, não o UUID interno do chat. Edição e exclusão dependem das regras da API e do WhatsApp; não repita automaticamente uma operação após timeout.

### Baixar uma mídia

```ts
const arquivo = await zappaz.messages.getMediaBinary('ID_WHATSAPP_DA_MENSAGEM')
const bytes = new Uint8Array(arquivo.data)
const mimeType = arquivo.headers.get('content-type')

// Leitura parcial opcional. O SDK preserva status 200/206 e headers da API.
const trecho = await zappaz.messages.getMediaBinary('ID_WHATSAPP_DA_MENSAGEM', {
  range: 'bytes=0-1023',
})

// Alternativa em JSON: data.media contém o base64.
const { data } = await zappaz.messages.getMediaBase64('ID_WHATSAPP_DA_MENSAGEM')
```

`mimeType` e `fileName` da resposta base64 podem ser nulos. Range inválido pode produzir erro 416 com `Content-Range` nos headers do erro.

### Grupos e contatos

```ts
const grupos = await zappaz.groups.list()

await zappaz.groups.addParticipants('123456789@g.us', [
  '5511999999999',
])

const resultado = await zappaz.contacts.isOnWhatsApp('5511999999999@s.whatsapp.net')
if (resultado.isOnWhatsApp === true) {
  // O serviço confirmou a existência do número.
}
```

Os arrays de participantes são enviados diretamente. A propriedade `isOnWhatsApp` pode ser omitida se o serviço não devolver resultado. `contacts` opera no WhatsApp, não na agenda local da Zappaz. Grupos podem ter resultados parciais; respostas complexas permanecem `unknown` quando não há contrato estável comprovado.

### Configurar o webhook da sessão

```ts
const { data: webhook } = await zappaz.webhooks.create({
  url: 'https://sua-integracao.example.com/webhooks/zappaz',
  displayName: 'Integração de pedidos',
  enabled: true,
  events: { 'inbound-message.upsert': true },
  secret: process.env.ZAPPAZ_WEBHOOK_SECRET!,
})
```

Use uma URL pública HTTPS acessível pelo servidor Zappaz, não `localhost`. A sessão também precisa estar habilitada. Não registre a resposta completa: ela contém o segredo e headers adicionais. Na atualização, enviar `events` redefine os eventos omitidos para `false`; enviar `headers` substitui o conjunto de headers adicionais. `secret: null` remove o segredo, e omiti-lo preserva o valor existente.

## Recebimento de mensagens por webhook com Hono

No projeto consumidor:

```sh
bun add hono @zappaz/zappaz-lite-sdk
```

Crie `index.ts`:

```ts
import { Hono } from 'hono'
import { Zappaz } from '@zappaz/zappaz-lite-sdk'

const app = new Hono()
const zappaz = new Zappaz({
  baseUrl: process.env.ZAPPAZ_BASE_URL!,
  apiKey: process.env.ZAPPAZ_API_KEY!,
  sessionId: process.env.ZAPPAZ_SESSION_ID!,
  webhookSecret: process.env.ZAPPAZ_WEBHOOK_SECRET!,
  timeoutMs: 10000,
  onWebhookError: () => {
    console.error('Falha ao processar webhook Zappaz')
  },
})

zappaz.onMessage('text', async (ctx) => {
  // text pode estar ausente mesmo em uma mensagem do tipo text.
  if (ctx.message.text?.trim().toLowerCase() === 'olá') {
    await ctx.reply('Olá! Como posso ajudar?')
  }
})

app.post('/webhooks/zappaz', (c) => zappaz.handleWebhook(c.req.raw))

// Servidor Bun; o SDK não abre a porta por conta própria.
export default { port: 3000, fetch: app.fetch }
```

Execute com `bun run index.ts` e configure na Zappaz a URL pública que aponta para `/webhooks/zappaz`, com o mesmo segredo e `inbound-message.upsert` habilitado. Não consuma o corpo antes com `c.req.json()`: o SDK verifica `X-Zappaz-Webhook-Secret`, limita o corpo e valida JSON, envelope e sessão antes de chamar os handlers.

Qualquer servidor compatível com Fetch pode encaminhar `Request` a `zappaz.handleWebhook(request)` e devolver a `Response`. Hono não é dependência obrigatória do SDK.

### Responder com e sem citação

```ts
zappaz.onMessage('text', async (ctx) => {
  await ctx.reply('Mensagem na mesma conversa')
  await ctx.reply('Resposta citada', { quote: true })
})
```

`reply` usa `chatId`, inclusive em grupos, e falha se ele estiver ausente. Não cita por padrão. `quote: true` exige `message.id` e depende do armazenamento da mensagem no backend. Os defaults de prévia de link e assinatura da sessão são preservados; opções como `linkPreview: false` e `signMessage: false` podem ser passadas explicitamente.

Os handlers de entrada não são disparados por `messages.send`, `outbound-message.upsert` ou mensagens com `fromMe: true`, evitando loops de mensagens próprias. Registre apenas os handlers que desejar executar: os dois exemplos de `onMessage('text', ...)` acima são alternativas; se registrar ambos, ambos executarão em ordem.

### Acumular mensagens de texto com debounce

Disponível a partir da versão `0.2.0`, assim como as opções de log abaixo.

Use `onTextDebounced` **no lugar** de um handler imediato de texto quando quiser responder ao conjunto de mensagens após uma pausa:

```ts
const cancelarDebounce = zappaz.onTextDebounced(
  { delayMs: 10000 }, // 5, 10 ou 20 segundos: 5000, 10000 ou 20000 ms.
  async (ctx) => {
    const texto = ctx.messages
      .map((message) => message.text)
      .filter(Boolean)
      .join('\n')

    // Envie `texto` ao seu agente e responda uma única vez.
    await ctx.reply(`Recebi suas mensagens:\n${texto}`)
  },
)

// Ao encerrar a integração, descarte timers e lotes ainda não iniciados:
// cancelarDebounce()
```

- A configuração é por handler: `delayMs` deve ser inteiro de 1 a 2147483647. Não existe debounce global.
- Apenas textos recebidos, não próprios, com conteúdo não vazio entram no lote e reiniciam o timer. Imagens, áudios, textos ausentes/em branco e eventos de saída não alteram o prazo.
- Cada registro tem lotes independentes por sessão e conversa; em grupos, também por `sender.id`. Sem `chatId`, ou sem remetente em grupos, o processamento falha com 500 em vez de misturar usuários. Em conversas privadas, `chatId` basta mesmo se `sender.id` estiver vazio.
- `ctx.messages` contém as mensagens na ordem em que entram no buffer. `ctx.reply()` responde na conversa; `{quote: true}` cita a **última mensagem do lote** e exige o ID dela.
- `onEvent` e `onMessage` continuam imediatos e executam antes do armazenamento no buffer. Se falharem, a mensagem não entra no debounce. Evite responder nos dois handlers, pois isso gera respostas adicionais.
- O webhook retorna 204 após armazenar a mensagem, **antes do processamento do lote**. Falhas posteriores são encaminhadas a `onWebhookError`, sem retry automático nem alteração da resposta HTTP já enviada.
- Lotes de uma mesma chave e registro são processados sequencialmente, inclusive se novas mensagens chegarem durante um handler lento. Chaves diferentes podem executar em paralelo. Registros diferentes não são serializados entre si.
- A função retornada cancela o registro, timers e lotes ainda não iniciados; não interrompe um handler em execução nem envia mensagens pendentes.

**Limitações:** o buffer fica em memória, perde mensagens em reinícios e não coordena múltiplas instâncias. Não há deduplicação, limite de mensagens por lote ou prazo máximo enquanto o usuário continua enviando. Timers podem manter o processo ativo até dispararem. Para entrega durável, use uma fila externa.

### Visualizar payloads recebidos no terminal

O log é **desativado por padrão**. Para diagnóstico, configure na mesma instância que recebe o webhook:

```ts
const zappaz = new Zappaz({
  baseUrl: process.env.ZAPPAZ_BASE_URL!,
  apiKey: process.env.ZAPPAZ_API_KEY!,
  sessionId: process.env.ZAPPAZ_SESSION_ID!,
  webhookSecret: process.env.ZAPPAZ_WEBHOOK_SECRET!,
  logWebhookPayloads: true,
})
```

`logWebhookPayloads: true` imprime `{event, session, payload}` como JSON formatado via `console.debug`, após autenticação e validação de envelope, sessão, evento e mensagem. Requisições rejeitadas não são registradas. O SDK não inclui os headers HTTP nem sua configuração de API Key/segredo no log, mas **o conteúdo dos payloads não é redigido**: mensagens, telefones e qualquer dado sensível enviado no corpo podem aparecer. Use somente com uma política adequada de proteção de dados.

Para integrar um logger existente, configure `onWebhookPayload`. Esse callback habilita a observação mesmo sem `logWebhookPayloads` e substitui a saída no console, evitando duplicação:

```ts
// Opção de new Zappaz({...}), usando o logger já existente no projeto:
// onWebhookPayload: (event) => {
//   logger.debug({ event }, 'Webhook Zappaz recebido')
// },
```

O callback recebe uma cópia isolada do envelope e é aguardado antes dos handlers. Falhas nele são encaminhadas a `onWebhookError`, sem impedir o processamento normal. Falhas no próprio observador de erros são silenciadas. Evite callbacks de log lentos, pois atrasam a resposta HTTP.

### Respostas HTTP do receptor

| Status | Significado |
| --- | --- |
| 204 | Handlers imediatos concluíram e textos foram armazenados no debounce, se configurado; não garante processamento posterior nem entrega ao WhatsApp. |
| 400 | JSON, envelope ou mensagem normalizada inválidos. |
| 401 | Segredo ausente/incorreto ou autenticação própria rejeitada. |
| 403 | Sessão diferente da configurada. |
| 405 / 415 | Método diferente de POST / content type diferente de `application/json`. |
| 413 | Corpo maior que `maxWebhookBytes`. |
| 422 | Nome de evento desconhecido. |
| 500 | Handler falhou; detalhes não são enviados no corpo HTTP. |
| 503 | Nenhum mecanismo de autenticação configurado. |

Os handlers executam na ordem de registro e param na primeira falha. `onEvent` executa antes de `onMessage`. `onWebhookError` pode observar falhas de processamento; uma falha nesse observador não altera o 500. Não há fila durável, deduplicação ou garantia de ordem entre requisições. Se sua integração precisa responder rápido, enfileire de forma durável antes de concluir seu handler.

O segredo é compartilhado, não uma assinatura HMAC, e não impede replay. Use HTTPS e implemente idempotência persistente quando necessário. IDs de mensagem podem ser nulos e não são globalmente únicos.

## Outros eventos

```ts
zappaz.onMessage('image', async (ctx) => {
  // media continua opcional; não confunda a miniatura com o arquivo completo.
  const mimeType = ctx.message.media?.mimeType
})

zappaz.onEvent(async (event) => {
  if (event.event === 'messages.update') {
    // event.payload é unknown: valide a estrutura antes de acessar campos.
  }
})
```

Os payloads são os produzidos pela Zappaz, não os eventos originais do Baileys. O SDK preserva campos adicionais, mas nem todos têm tipagem ou validação profunda. A [referência de webhooks](WEBHOOKS.md) descreve os 26 nomes cadastráveis, os 15 tipos de mensagem, os produtores e as ressalvas de reenvio — inclusive dois nomes cadastráveis sem produtor identificado no backend conferido.

## Erros, timeout e cancelamento

```ts
import { ZappazError, ZappazNetworkError, ZappazProtocolError } from '@zappaz/zappaz-lite-sdk'

const controller = new AbortController()

try {
  await zappaz.messages.sendText(
    { number: '5511999999999', message: 'Olá!' },
    { signal: controller.signal, timeoutMs: 5000 },
  )
} catch (error) {
  if (error instanceof ZappazError) {
    console.error('Erro da API:', error.status, error.code)
    // error.issues: detalhes opcionais de validação.
    // error.retryAfter: valor bruto de Retry-After, em segundos ou data HTTP.
    // error.headers: metadados, incluindo Content-Range em erros 416.
  } else if (error instanceof ZappazProtocolError) {
    console.error('Resposta JSON inválida:', error.status)
  } else if (error instanceof ZappazNetworkError) {
    console.error('Falha de rede, timeout ou cancelamento')
    // A causa original está em error.cause; trate-a como potencialmente sensível.
  } else {
    throw error
  }
}
```

Para cancelar uma chamada em andamento, invoque `controller.abort()`. Nenhuma operação é repetida automaticamente. Ao receber 429, respeite `Retry-After`; não repita escritas cegamente, pois um timeout pode ocorrer após o efeito remoto. Redirects são rejeitados para proteger a API Key. O SDK não registra credenciais ou conteúdo por padrão; não registre respostas completas, mídias, causas ou payloads sem uma política de proteção de dados.

## Compatibilidade e desenvolvimento

- ESM com declarações `.d.ts`; CJS não é anunciado.
- Exercitado com **Bun 1.4.3** e **Node 25.2.1**. Outras versões não foram certificadas.
- O runtime precisa de Fetch, Web Crypto e AbortController nativos.
- Métodos e testes de transporte para as **46 rotas** do recorte de integração. Veja [a referência](docs/API.md).
- Os testes usam fixtures e servidores locais, incluindo redirect entre origens e consumo do pacote empacotado. Não substituem testes com uma sessão real.
- Respostas complexas não comprovadas permanecem `unknown`; a validação de negócio dos bodies cabe à API, sem reimplementar seus schemas no consumidor.
- Fora do escopo: administração, criação de sessão, chat, agenda local, Socket.IO e MCP.

No código-fonte do SDK:

```sh
bun install
bun run typecheck
bun run test
bun run format:check
bun run build
```

## Licença

[MIT](LICENSE).
