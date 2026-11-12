import type { DebouncedTextContext, MessageContext, TextDebounceOptions } from './index.js'

type TextHandler = (context: DebouncedTextContext) => unknown | Promise<unknown>
type Batch = {
  contexts: MessageContext<'text'>[]
  timer: ReturnType<typeof setTimeout>
}

/** One registration owns its timers and processing chains. No durable delivery. */
export class TextDebouncer {
  private readonly batches = new Map<string, Batch>()
  private readonly chains = new Map<string, Promise<void>>()
  private active = true

  constructor(
    private readonly options: TextDebounceOptions,
    private readonly handler: TextHandler,
    private readonly onError: (error: unknown) => Promise<void>,
  ) {
    if (
      !Number.isInteger(options.delayMs) ||
      options.delayMs < 1 ||
      options.delayMs > 2_147_483_647
    ) {
      throw new Error('delayMs deve ser um inteiro positivo até 2147483647')
    }
    this.options = { ...options }
  }

  add(context: MessageContext<'text'>): void {
    if (!this.active || !context.message.text?.trim()) return
    const { message, session } = context
    const sender = message.isGroup ? message.sender.id : message.chatId
    if (!message.chatId || !sender) {
      throw new Error('Debounce exige chatId e, em grupos, ID do remetente')
    }
    const key = JSON.stringify([session.id, message.chatId, sender])
    const previous = this.batches.get(key)
    if (previous) clearTimeout(previous.timer)
    const contexts = previous?.contexts ?? []
    contexts.push(context)
    const batch: Batch = {
      contexts,
      timer: setTimeout(() => this.dispatch(key, batch), this.options.delayMs),
    }
    this.batches.set(key, batch)
  }

  private dispatch(key: string, batch: Batch): void {
    if (this.batches.get(key) !== batch) return
    this.batches.delete(key)
    const last = batch.contexts[batch.contexts.length - 1]!
    const chain = (this.chains.get(key) ?? Promise.resolve())
      .then(async () => {
        if (!this.active) return
        await this.handler({
          messages: batch.contexts.map((context) => context.message),
          session: last.session,
          event: last.event,
          reply: last.reply,
        })
      })
      .catch(this.onError)
      .finally(() => {
        if (this.chains.get(key) === chain) this.chains.delete(key)
      })
    this.chains.set(key, chain)
  }

  cancel(): void {
    this.active = false
    for (const batch of this.batches.values()) clearTimeout(batch.timer)
    this.batches.clear()
  }
}
