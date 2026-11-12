# Contratos de webhook da Zappaz

Esta referência descreve o **JSON emitido pela Zappaz Lite**, não os eventos recebidos diretamente do WhatsApp nem os DTOs REST do chat. A conferência foi feita no código do backend Zappaz Lite, sem modificá-lo. O SDK não depende desse repositório para executar.

## Envelope

```ts
{
  event: string,
  payload: unknown,
  session: { id: string, status: string, jid: string | null }
}
```

A Zappaz constrói esse envelope em `WhatsappSession.forwardEvent`, seleciona os webhooks habilitados e envia JSON com os headers configurados. O segredo compartilhado vai em `X-Zappaz-Webhook-Secret`; não há assinatura HMAC ou identificador único de entrega. `session.status` é o estado disponível quando o encaminhamento ocorre; numa atualização de conexão, não substitui `payload.connection`.

O SDK autentica, limita o corpo e confere envelope e sessão antes do despacho. `onMessage` escuta somente `inbound-message.upsert` com `fromMe: false`. `onEvent` recebe todos os nomes conhecidos, mantendo `payload: unknown` e preservando seus campos; valide os campos antes de acessá-los.

## Eventos normalizados pela Zappaz

| Evento | Payload emitido | Produtor |
| --- | --- | --- |
| `inbound-message.upsert` | `{message: NormalizedMessage}` | `onMessagesUpsert`, mensagem de entrada |
| `outbound-message.upsert` | `{message: NormalizedMessage}` | `onMessagesUpsert`, mensagem própria |
| `messages.send` | `{message: NormalizedMessage}` | `sendMessage`, quando existe resultado de envio |
| `messages.update` | `{messages: [...]}` | `normalizeMessageUpdates` |
| `messages.reaction` | `{reactions: [...]}` | `normalizeMessageReactions` |
| `message-receipt.update` | `{receipts: [...]}` | `normalizeMessageReceipts` |

`messages.upsert` não é o nome enviado: a Zappaz separa suas mensagens nos eventos de entrada e saída. O resultado REST de envio também não é `NormalizedMessage`.

### Mensagem normalizada

`id`, `chatId`, `remoteJid`, `lid` e `timestamp` são `string | null`. `fromMe` e `isGroup` são booleanos; `sender` contém `id: string | null` e `name?: string`. Não converta LID em telefone. Nos grupos, use `chatId` para responder, não `sender.id`.

| `message.type` | Campos produzidos quando disponíveis |
| --- | --- |
| `text` | `text`; pode também conter `interactive`, `selection` ou `templateReply` |
| `image`, `video`, `audio`, `document`, `sticker` | `media` e legenda em `text`; áudio pode ter `media.voice` |
| `location` | `location` com coordenadas, nome, endereço ou URL; coordenadas ausentes não viram `0,0` |
| `contact` | `contacts: [{name, vcard, parsed}]`; valores escalares ausentes são nulos e `parsed` pode ser nulo |
| `reaction` | `reaction: {messageId: string | null, emoji: string}` |
| `poll` | `poll` com nome, limite de seleção, opções com hash/contagem e votos |
| `album` | `album: {expectedImageCount, expectedVideoCount}`; mídias são mensagens separadas |
| `group_invite` | `groupInvite` com grupo, nome, vencimento, URL e miniatura; campos indisponíveis podem ser nulos |
| `system` | `system: {kind, duration, blocked}`; `kind` é `disappearing_mode` ou `block_contact` |
| `unavailable` | `unavailable.reason`: `missing_content` ou `linked_device` |
| `unknown` | Tipo não reconhecido; pode ser tratado com `onMessage('unknown', ...)` |

Os campos de conteúdo são opcionais e podem coexistir; isso **não é uma união discriminada estrita** que torne um campo obrigatório conforme `type`.

- `media` pode conter `mimeType`, `fileName`, `size`, `duration`, `voice`, `downloadPath` e miniatura JPEG. Não contém o arquivo completo. O download exige uma chamada autenticada à API.
- `replyTo` contém `id`, `senderId?` e o conteúdo citado disponível, incluindo mídia e miniatura. Não há citação aninhada ou download inventado para a mensagem citada.
- `interactive` contém título, rodapé e botões, com lista ou pagamento quando reconhecidos. Respostas a botão/lista usam `selection`; respostas de template usam `templateReply`. Nem toda interação altera `type`.
- `contacts[].parsed` contém nome, primeiro/último nome, telefones, e-mails e organização. O vCard original é preservado. Os telefones do contato compartilhado não identificam necessariamente o remetente.
- `mentions`, `status`, `reactions` e `receipts` podem acompanhar a mensagem normalizada.
- Conteúdo ausente, localização em tempo real encerrada e avisos de sistema são tratados explicitamente e podem substituir o tipo/texto inicialmente extraído.

O SDK valida os campos comuns declarados em `NormalizedMessage`. Campos complexos ainda não declarados nessa interface permanecem `unknown` e não são descartados. Nem toda variante opcional está tipada ou foi exercitada numa sessão real.

### Atualizações, reações e recibos

Todos usam referências com `id`, `chatId`, `remoteJid`, `lid` anuláveis e `fromMe` booleano.

- `messages.update`: itens podem conter `status`, `pollVotes` e `location` final. Status ausente não é inferido; os valores conhecidos são `error`, `pending`, `sent`, `delivered`, `read` e `played`. Coordenadas da atualização final podem ser nulas.
- `messages.reaction`: itens incluem `sender: {id, fromMe}`, `emoji` e `timestamp`. `emoji: ''` indica remoção. O remetente da reação pode diferir do autor da mensagem alvo.
- `message-receipt.update`: itens incluem `recipientId`, `deliveredAt`, `readAt` e `playedAt`, anuláveis.

Esses são payloads normalizados pela Zappaz, não os arrays originais de atualização recebidos pelo cliente WhatsApp. No SDK atual, `onEvent` mantém `payload: unknown`, sem prometer validação completa dessas estruturas.

## Demais saídas

A Zappaz também processa persistência, identidade, histórico e estado de sessão. Nos métodos abaixo, o argumento enviado a `forwardEvent` é `payload: eventPayload`, sem transformá-lo em mensagem normalizada. Esta tabela descreve o nível superior observado no código e nos tipos da dependência instalada, não um contrato rígido de campos internos.

| Evento | Forma encaminhada |
| --- | --- |
| `call` | Array de chamadas |
| `blocklist.set` | Objeto com `blocklist` |
| `blocklist.update` | Objeto com `blocklist` e `type` |
| `chats.delete` | Array de identificadores |
| `chats.update` | Array de atualizações de conversa |
| `chats.upsert` | Array de conversas |
| `connection.update` | Objeto parcial de atualização de conexão |
| `contacts.update` | Array de contatos parciais |
| `contacts.upsert` | Array de contatos |
| `group-participants.update` | Objeto com grupo, autor, participantes e ação |
| `groups.update` | Array de grupos parciais |
| `groups.upsert` | Array de grupos |
| `labels.association` | Objeto com associação e tipo de alteração |
| `labels.edit` | Objeto de etiqueta |
| `messages.delete` | `{keys: [...]}` ou `{jid, all: true}` |
| `messages.media-update` | Array; campos binários/erros seguem a serialização JSON do transporte |
| `messaging-history.set` | Objeto com conversas, contatos, mensagens e metadados de sincronização; não é `payload.message` |
| `presence.update` | Objeto com `id` e `presences` |

Os dados enviados por HTTP passaram pela serialização JSON: não espere instâncias de `Date`, `Error`, `Buffer` ou objetos do Baileys no receptor. O SDK não importa esses tipos nem os reconstrói.

### Nomes cadastráveis sem produtor encontrado

`chats.phoneNumberShare` e `group.join-request` aparecem no schema de cadastro, mas não têm listener de encaminhamento em `attachEventListeners` no código conferido. O SDK os aceita na configuração e em `onEvent`, sem garantir emissão pela API atual. Essa diferença não foi corrigida no backend.

A conferência encontrou **26 nomes cadastráveis**, dos quais **24 têm caminhos de emissão identificados**. `creds.update`, `lid-mapping.update` e outros eventos internos não se tornam webhooks públicos por serem tratados internamente.

## Reenvios e compatibilidade

O retry usa o conteúdo salvo sem aplicar novamente o normalizador e reconstrói o envelope com a sessão atual. Logs antigos podem reenviar contratos legados. Existe tratamento específico para o antigo `base64Media`.

Uma ressalva do código atual: `resendWebhookEvent` reconstrói o payload com `{...payload}`. Para um payload originalmente em array, isso pode produzir um objeto de chaves numéricas no reenvio. O SDK não o converte de volta para array nem corrige o backend silenciosamente.

Mensagens legadas incompatíveis com o contrato normalizado validado retornam 400; não são aceitas silenciosamente como mensagens atuais. Nos demais eventos conhecidos, `onEvent` mantém o conteúdo recebido. Reenvios podem duplicar eventos; não há deduplicação nem garantia de entrega exatamente uma vez.

## Fontes e limites da conferência

- `server/src/modules/webhooks/schema.ts`: nomes cadastráveis.
- `server/src/lib/whatsapp-session.ts`: listeners, produtores, transporte, envio e reenvio.
- `server/src/lib/whatsapp-event-normalizer.ts`: referências, conteúdos, atualizações, reações e recibos normalizados.
- `server/src/lib/whatsapp-interactive.ts`, `whatsapp-poll.ts`, `vcard.ts` e `chat-contract.ts`: estruturas auxiliares.
- `server/src/services/whatsapp.ts`: seleção e validação dos logs a reenviar.
- `server/src/modules/docs/webhook-payloads.ts`: exemplos de saída da API.

Essa é uma auditoria dos caminhos de código atuais e de fixtures sintéticas, não a captura de todas as combinações possíveis numa sessão WhatsApp real. Alterações na Zappaz exigem nova conferência.
