import { HttpClient, type HttpConfig } from './http.js'
import { TextDebouncer } from './debounce.js'
import { Contacts, Groups, Messages, PrivacySettings, Profile, Webhooks } from './resources.js'
import {
  WEBHOOK_EVENTS,
  MESSAGE_TYPES,
  type MessageType,
  type NormalizedMessage,
  type SendText,
  type WebhookEnvelope,
  type WebhookSession,
} from './types.js'
import {
  equalSecret,
  isObject,
  readLimited,
  validEnvelope,
  validMessage,
  WebhookBodyTooLarge,
} from './webhook.js'

export * from './types.js'
export { ZappazError, ZappazNetworkError, ZappazProtocolError } from './http.js'
export type { Fetch } from './http.js'
export type { BinaryMedia } from './resources.js'

export interface ZappazOptions extends HttpConfig {
  webhookSecret?: string
  /** Must not consume the request body. If secret is also set, both checks must pass. */
  authenticateWebhook?: (request: Request) => boolean | Promise<boolean>
  maxWebhookBytes?: number
  /** No automatic logging; the consumer decides how to report sensitive exceptions. */
  onWebhookError?: (error: unknown) => void | Promise<void>
  /** Opt-in console logging of validated webhook envelopes. Contains personal data. */
  logWebhookPayloads?: boolean
  /** Opt-in custom logger. Replaces console logging; receives an isolated copy. */
  onWebhookPayload?: (event: WebhookEnvelope) => void | Promise<void>
}
export interface MessageContext<T extends MessageType = MessageType> {
  message: NormalizedMessage & { type: T }
  session: WebhookSession
  event: 'inbound-message.upsert'
  reply(
    text: string,
    options?: Omit<SendText, 'number' | 'message' | 'quoted'> & { quote?: boolean },
  ): ReturnType<Messages['sendText']>
}
type Handler<T extends MessageType = MessageType> = (
  context: MessageContext<T>,
) => unknown | Promise<unknown>
export interface TextDebounceOptions {
  delayMs: number
}
export interface DebouncedTextContext {
  messages: Array<NormalizedMessage & { type: 'text' }>
  session: WebhookSession
  event: 'inbound-message.upsert'
  /** Replies to the last message in the batch when quote is true. */
  reply: MessageContext<'text'>['reply']
}
type EventHandler = (event: WebhookEnvelope) => unknown | Promise<unknown>
const knownEvents = new Set<string>(WEBHOOK_EVENTS)
const messageEvents = new Set([
  'inbound-message.upsert',
  'outbound-message.upsert',
  'messages.send',
])

export class Zappaz {
  readonly messages: Messages
  readonly groups: Groups
  readonly profile: Profile
  readonly contacts: Contacts
  readonly privacy: PrivacySettings
  readonly webhooks: Webhooks
  private readonly options: Readonly<ZappazOptions>
  private readonly handlers = new Map<MessageType, Handler[]>()
  private readonly eventHandlers: EventHandler[] = []
  private readonly textDebouncers = new Set<TextDebouncer>()

  constructor(options: ZappazOptions) {
    this.options = { ...options }
    const http = new HttpClient(options)
    this.messages = new Messages(http)
    this.groups = new Groups(http)
    this.profile = new Profile(http)
    this.contacts = new Contacts(http)
    this.privacy = new PrivacySettings(http)
    this.webhooks = new Webhooks(http)
    if (
      options.webhookSecret !== undefined &&
      !/^[\x21-\x7e]{1,2048}$/.test(options.webhookSecret)
    ) {
      throw new Error('webhookSecret deve conter 1–2048 caracteres ASCII visíveis, sem espaços')
    }
    if (
      options.maxWebhookBytes !== undefined &&
      (!Number.isSafeInteger(options.maxWebhookBytes) || options.maxWebhookBytes < 1)
    ) {
      throw new Error('maxWebhookBytes inválido')
    }
  }

  onMessage<T extends MessageType>(type: T, handler: Handler<T>): void {
    if (!MESSAGE_TYPES.some((value) => value === type)) throw new Error('Tipo de mensagem inválido')
    const handlers = this.handlers.get(type) ?? []
    // Dispatch below checks type before passing the context to this handler.
    handlers.push(handler as Handler)
    this.handlers.set(type, handlers)
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler)
  }

  /** Returns an unsubscribe function that discards pending, not running, batches. */
  onTextDebounced(
    options: TextDebounceOptions,
    handler: (context: DebouncedTextContext) => unknown | Promise<unknown>,
  ): () => void {
    const debouncer = new TextDebouncer(options, handler, (error) => this.reportWebhookError(error))
    this.textDebouncers.add(debouncer)
    return () => {
      debouncer.cancel()
      this.textDebouncers.delete(debouncer)
    }
  }

  private async reportWebhookError(error: unknown): Promise<void> {
    try {
      await this.options.onWebhookError?.(error)
    } catch {
      /* Observability must not leak details or create unhandled rejections. */
    }
  }

  private createContext(message: NormalizedMessage, session: WebhookSession): MessageContext {
    return {
      message,
      session,
      event: 'inbound-message.upsert',
      reply: (text, options) => {
        if (!message.chatId) return Promise.reject(new Error('Mensagem sem chatId para resposta'))
        const { quote, ...rest } = options ?? {}
        if (quote && !message.messageId)
          return Promise.reject(new Error('Mensagem sem ID WhatsApp para citação'))
        return this.messages.sendText({
          ...rest,
          number: message.chatId,
          message: text,
          ...(quote ? { quoted: message.messageId! } : {}),
        })
      },
    }
  }

  async handleWebhook(request: Request): Promise<Response> {
    const response = (status: number) =>
      new Response(null, { status, ...(status === 405 ? { headers: { Allow: 'POST' } } : {}) })
    if (request.method !== 'POST') return response(405)
    if (
      request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/json'
    )
      return response(415)
    if (!this.options.webhookSecret && !this.options.authenticateWebhook) return response(503)
    try {
      if (
        this.options.webhookSecret &&
        !(await equalSecret(
          request.headers.get('x-zappaz-webhook-secret') ?? '',
          this.options.webhookSecret,
        ))
      )
        return response(401)
      if (this.options.authenticateWebhook && !(await this.options.authenticateWebhook(request)))
        return response(401)
    } catch {
      return response(401)
    }

    let data: unknown
    try {
      data = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readLimited(request, this.options.maxWebhookBytes ?? 1024 * 1024),
        ),
      )
    } catch (error) {
      return response(error instanceof WebhookBodyTooLarge ? 413 : 400)
    }
    if (!validEnvelope(data)) return response(400)
    if (data.session.id !== this.options.sessionId) return response(403)
    if (!knownEvents.has(data.event)) return response(422)
    if (
      messageEvents.has(data.event) &&
      (!isObject(data.payload) || !validMessage(data.payload.message))
    )
      return response(400)
    // Capture registration order before calling user code, which can register more handlers.
    const eventHandlers = [...this.eventHandlers]
    const debouncers = [...this.textDebouncers]
    const message =
      data.event === 'inbound-message.upsert' && isObject(data.payload)
        ? (data.payload.message as NormalizedMessage)
        : undefined
    const handlers = message && !message.fromMe ? [...(this.handlers.get(message.type) ?? [])] : []
    if (this.options.logWebhookPayloads || this.options.onWebhookPayload) {
      try {
        const logged: WebhookEnvelope = structuredClone({
          event: data.event,
          payload: data.payload,
          session: data.session,
        })
        if (this.options.onWebhookPayload) await this.options.onWebhookPayload(logged)
        else console.debug('[Zappaz webhook]', JSON.stringify(logged, null, 2))
      } catch (error) {
        await this.reportWebhookError(error)
      }
    }
    try {
      for (const handler of eventHandlers) await handler(data)
      if (message && !message.fromMe) {
        const context = this.createContext(message, data.session)
        for (const handler of handlers) await handler(context)
        if (message.type === 'text') {
          for (const debouncer of debouncers) {
            debouncer.add(context as MessageContext<'text'>)
          }
        }
      }
      return response(204)
    } catch (error) {
      await this.reportWebhookError(error)
      return response(500)
    }
  }
}
