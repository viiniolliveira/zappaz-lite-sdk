# Referência dos métodos

Todos os recursos pertencem à sessão configurada na instância `zappaz`. O SDK envia `x-api-key`, codifica cada segmento do caminho e preserva a resposta da API sem extrair `data` silenciosamente. As requisições podem receber `{signal, timeoutMs}` como último argumento; `webhooks.list` e `listLogs` recebem query antes dessas opções.

`S` significa `/api/v1/session/:sessionId`. Nenhum método cria a sessão. Os bodies abaixo são objetos JSON, exceto arrays diretos de participantes; operações sem body não enviam `{}`. Exemplos e contratos de eventos estão no [README](../README.md) e em [WEBHOOKS.md](../WEBHOOKS.md).

## Mensagens e mídia — 13 rotas

| Método | HTTP | Entrada principal |
| --- | --- | --- |
| `messages.list(query?, options?)` | `GET S/messages` | `conversationId?`, `phoneNumber?`, `lid?`, `jid?`, `limit?`, `before?` ou `after?` |
| `messages.get(messageId, filters, options?)` | `GET S/messages/:messageId` | ID WhatsApp e pelo menos um filtro: `conversationId`, `phoneNumber`, `lid` ou `jid` |
| `messages.sendText(input)` | `POST S/message/text` | `{number, message, linkPreview?, signMessage?, signatureName?, ...}` |
| `messages.sendImage(input)` | `POST S/message/image` | `{number, source, fileName?, caption?, ...}` |
| `messages.sendVideo(input)` | `POST S/message/video` | Campos de imagem e `gifPlayback?` |
| `messages.sendAudio(input)` | `POST S/message/audio` | `{number, source, caption?, asVoiceNote?, ...}` |
| `messages.sendDocument(input)` | `POST S/message/document` | Campos de imagem |
| `messages.sendContact(input)` | `POST S/message/contact` | `{number, contact: {firstName, lastName, phoneNumber, ...}, ...}` |
| `messages.sendLocation(input)` | `POST S/message/location` | `{number, location: {degreesLatitude?, degreesLongitude?, address?, ...}, ...}` |
| `messages.editText(messageId, {text})` | `PATCH S/message/:messageId` | Texto completo, não vazio |
| `messages.deleteForEveryone(messageId)` | `DELETE S/message/:messageId` | Sem body |
| `messages.getMediaBase64(messageId)` | `GET S/message/:messageId/media/base64` | Sem body |
| `messages.getMediaBinary(messageId, options?)` | `GET S/message/:messageId/media/binary` | Opções também aceitam `range?: string` |

Campos comuns de envio: `number`, `mentions?`, `quoted?` e `delay?`. A API aceita esses campos nos schemas, mas isso não garante encaminhamento de citação/menções em todos os tipos de mídia, contato ou localização. Texto usa `message`; edição usa `text`. Assinatura e prévia de link seguem os defaults do servidor quando omitidas. `signatureName` sozinho não ativa assinatura.

Envios preservam `{status: 'success', message?: unknown}`: o resultado bruto não é uma mensagem normalizada de webhook e pode ser nulo/ausente. Edição preserva `{status, data}` com DTO ainda tipado como `unknown`; exclusão preserva `{status, deleted}` quando esse campo é produzido. Use IDs WhatsApp, não UUIDs internos do chat.

Base64: `{status, data: {media, mimeType, fileName}}`, com MIME/nome anuláveis. Binário: `{status, headers, data: ArrayBuffer}`, preservando status e headers HTTP. Não há paginação nas rotas de mídia.

### Consultas persistidas

`messages.list` retorna `{status: 'success', data: MessageDTO[], page: {hasMore, nextCursor}, boundaries: {first, last}}`. Os cursores e os limites `first`/`last` são strings opacas ou `null`. `limit` é inteiro de 1 a 100 (padrão 50); `before` e `after` são mutuamente exclusivos. A ordenação e a semântica dos cursores seguem o histórico por conversa. Cursores são vinculados à sessão e aos filtros: preserve-os ao continuar a consulta. Não existe filtro `type`.

Filtros combinados usam AND: `conversationId` é UUID, `phoneNumber` contém somente dígitos com código do país, `lid` é JID completo terminado em `@lid` e `jid` é JID PN ou LID completo. Sem filtro de identidade, a listagem abrange a sessão. A resolução PN/LID usa identidade persistida, sem criar contatos. Grupos não são incluídos.

`messages.get` retorna `{status: 'success', data: MessageDTO}` e recebe **ID WhatsApp**, não UUID interno. Ausência no escopo retorna 404; filtro ausente ou parâmetros inválidos geram o erro de validação padrão da API. O SDK expressa filtros e exclusão de cursores nos tipos; a validação dos valores e do escopo é feita pelo servidor, preservando seus erros.

Ambos consultam persistência, não exigem WhatsApp conectado e mantêm autenticação/autorização de sessão. `MessageDTO` inclui UUID interno `id`, `messageId` WhatsApp, `conversationId`, `sessionId`, mídia e metadados REST; não é `NormalizedMessage`. Os endpoints existentes `/conversations/:conversationId/messages` e `/conversations/:conversationId/messages/:messageRecordId` não mudam; o último continua recebendo UUID interno. Nenhum método extra para essas rotas foi adicionado.

Limites atuais da API: texto até 65536 caracteres, legenda até 4096, nome de arquivo até 255 e `delay` inteiro de 0 a 10000 ms. Mídia padrão até 25 MiB decodificados, configurável no servidor. Localização exige endereço ou coordenadas utilizáveis; o backend atual tem uma ressalva com coordenadas `0`, portanto não presuma aceitação de `0,0`.

## Grupos — 11 rotas

| Método | HTTP | Body |
| --- | --- | --- |
| `groups.list()` | `GET S/group` | Nenhum |
| `groups.create(input)` | `POST S/group` | `{subject, description?, participants?}` |
| `groups.update(jid, input)` | `PUT S/group/:jid` | `{subject?, description?, onlyAdminsCanPost?, onlyAdminsCanEditInfo?}` |
| `groups.sendInvite(jid, input)` | `POST S/group/:jid/send-invite` | `{number, message?}` |
| `groups.addParticipants(jid, participants)` | `POST S/group/:jid/add` | Array direto de strings |
| `groups.removeParticipants(jid, participants)` | `POST S/group/:jid/remove` | Array direto de strings |
| `groups.promoteParticipants(jid, participants)` | `POST S/group/:jid/promote` | Array direto de strings |
| `groups.demoteParticipants(jid, participants)` | `POST S/group/:jid/demote` | Array direto de strings |
| `groups.getInviteCode(jid)` | `POST S/group/:jid/invite-code` | Nenhum |
| `groups.revokeInviteCode(jid)` | `POST S/group/:jid/invite-code-revoke` | Nenhum |
| `groups.leave(jid)` | `POST S/group/:jid/leave` | Nenhum |

Listagem, criação e participantes preservam resultados diretos, não um envelope genérico. Convites preservam os campos de código/URL; atualização e saída retornam status/mensagem. Use o JID do grupo, como `123456789@g.us`. Operações de participantes podem ter sucesso parcial e não têm retry automático.

## Perfil e contatos — 8 rotas

| Método | HTTP | Entrada |
| --- | --- | --- |
| `profile.getPicture(identifier)` | `GET S/display-picture` | Query `identifier`; retorna `{url, base64}` |
| `profile.updatePicture(input)` | `PUT S/display-picture` | `{identifier, source}` |
| `profile.updateName(input)` | `PUT S/update-profile-name` | `{name}` |
| `profile.updateStatus(input)` | `PUT S/update-profile-status` | `{status}` |
| `contacts.isOnWhatsApp(jid)` | `GET S/is-on-whatsapp/:jid` | Sem body; `{isOnWhatsApp?: boolean}` |
| `contacts.getAbout(jid)` | `GET S/get-about/:jid` | Sem body; resposta direta ainda `unknown` |
| `contacts.block(jid)` | `PUT S/block-contact/:jid` | Sem body |
| `contacts.unblock(jid)` | `PUT S/unblock-contact/:jid` | Sem body |

As atualizações de perfil e bloqueio retornam status/mensagem, e nome/status incluem o valor atualizado. Essas operações afetam o WhatsApp, não a agenda local da Zappaz.

## Privacidade — 8 rotas

| Método | HTTP | Valores |
| --- | --- | --- |
| `privacy.get()` | `GET S/privacy` | Resposta direta ainda `unknown` |
| `privacy.setLastSeen(value)` | `PUT S/privacy/last-seen` | `all`, `contacts`, `contact_blacklist`, `none` |
| `privacy.setOnline(value)` | `PUT S/privacy/online` | `all`, `match_last_seen` |
| `privacy.setProfilePicture(value)` | `PUT S/privacy/profile-picture` | Mesmos valores de last seen |
| `privacy.setStatus(value)` | `PUT S/privacy/status` | Mesmos valores de last seen |
| `privacy.setReadReceipts(value)` | `PUT S/privacy/read-receipts` | `all`, `none` |
| `privacy.setGroupsAdd(value)` | `PUT S/privacy/groups-add` | `all`, `contacts`, `contact_blacklist` |
| `privacy.setDisappearingMode(value)` | `PUT S/privacy/default-disappearing-mode` | `ONE_DAY`, `ONE_WEEK`, `THREE_MONTHS`, `OFF` |

O SDK constrói `{privacy: value}` ou `{mode: value}` conforme a rota. Escritas preservam status/mensagem e `privacy` ou `mode`. São alterações reais das configurações do WhatsApp.

## Webhooks de sessão — 8 rotas

| Método | HTTP | Entrada |
| --- | --- | --- |
| `webhooks.list(query?)` | `GET S/webhook` | `page?`, `pageSize?` |
| `webhooks.create(input)` | `POST S/webhook` | `CreateWebhook` |
| `webhooks.get(webhookId)` | `GET S/webhook/:webhookId` | Sem body |
| `webhooks.update(webhookId, input)` | `PUT S/webhook/:webhookId` | `Partial<CreateWebhook>` |
| `webhooks.delete(webhookId)` | `DELETE S/webhook/:webhookId` | Sem body |
| `webhooks.listLogs(webhookId, query?)` | `GET S/webhook/:webhookId/logs` | Paginação, `event?`, `status?`, `startDate?`, `endDate?` |
| `webhooks.getLog(webhookId, logId)` | `GET S/webhook/:webhookId/logs/:logId` | Retorna log diretamente |
| `webhooks.retryLog(webhookId, logId)` | `POST S/webhook/:webhookId/logs/:logId/retry` | Sem body; solicita reenvio real |

```ts
import type { CreateWebhook } from '@zappaz/zappaz-lite-sdk'

const input: CreateWebhook = {
  url: 'https://sua-integracao.example.com/webhooks/zappaz',
  enabled: true,
  events: { 'inbound-message.upsert': true },
  secret: 'SUBSTITUA_O_SEGREDO',
}
```

Campos adicionais: `displayName?` e `headers?: Record<string, string>`. `secret` também pode ser nulo para removê-lo. Headers de transporte e `X-Zappaz-Webhook-Secret` não podem ser sobrescritos por `headers`. São permitidos até 20 headers adicionais, com as restrições do servidor.

Listas retornam `{status, data, page, pageSize, total}`; **`page` e `pageSize` são strings**. Passe strings nas queries, por exemplo `{page: '1', pageSize: '20'}`. Preserve filtros ao buscar a página seguinte. Datas de log são strings ISO e os filtros abrangem dias completos no servidor. O padrão é página 1 com 100 itens; limite de 100 itens por página e até 10000 páginas. `getLog` não usa envelope; create/get/update/retry retornam `{status, data}`. Datas retornadas por JSON são strings ISO, não `Date`.

Essas rotas exigem sessão habilitada, mas não WhatsApp conectado. Os demais recursos normalmente exigem conexão; downloads podem usar mídia persistida sem conexão. A resposta de webhook contém segredos e headers sensíveis. Não registre objetos completos.

## Distribuição e limitações

As declarações TypeScript do pacote são a referência exata das assinaturas. `unknown` não significa descarte do conteúdo: significa que o consumidor deve validá-lo antes de acessar campos. Não há retry automático, paginação automática ou garantia de entrega única. As regras de validação e limites são responsabilidade da API e podem mudar entre versões do backend.
