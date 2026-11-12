import type { RequestOptions } from './types.js'

/** HTTP errors preserve status and safe metadata without retaining request credentials. */
export class ZappazError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
    public readonly issues?: unknown,
    public readonly retryAfter?: string | null,
    public readonly headers?: Headers,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ZappazError'
  }
}

export class ZappazNetworkError extends Error {
  constructor(cause: unknown) {
    super('A requisição à API falhou.', { cause })
    this.name = 'ZappazNetworkError'
  }
}

export class ZappazProtocolError extends Error {
  constructor(
    public readonly status: number,
    public readonly headers: Headers,
    cause: unknown,
  ) {
    super('A API retornou uma resposta JSON inválida.', { cause })
    this.name = 'ZappazProtocolError'
  }
}

/** A portable fetch signature; does not require Bun-specific fetch properties. */
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
export interface HttpConfig {
  baseUrl: string
  apiKey: string
  sessionId: string
  fetch?: Fetch
  timeoutMs?: number
}

export function validateTimeout(timeout: number | undefined): void {
  if (
    timeout !== undefined &&
    (!Number.isInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647)
  ) {
    throw new Error('timeoutMs deve ser um inteiro positivo até 2147483647')
  }
}

function segment(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') {
    throw new Error('Segmento de caminho inválido')
  }
  return encodeURIComponent(value)
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export class HttpClient {
  private readonly base: URL
  private readonly fetcher: Fetch
  private readonly config: Readonly<HttpConfig>

  constructor(config: HttpConfig) {
    this.config = { ...config }
    try {
      this.base = new URL(config.baseUrl)
    } catch {
      throw new Error('baseUrl inválida')
    }
    if (
      !['http:', 'https:'].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash
    ) {
      throw new Error('baseUrl inválida')
    }
    // Reject normalized dot segments before composing session-scoped URLs.
    segment(config.sessionId)
    if (
      typeof config.apiKey !== 'string' ||
      !config.apiKey.trim() ||
      /[^\x21-\x7e]/.test(config.apiKey)
    ) {
      throw new Error('apiKey inválida')
    }
    validateTimeout(config.timeoutMs)
    this.fetcher = config.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async request<T>(
    method: string,
    parts: string[],
    options: RequestOptions & {
      body?: unknown
      query?: object
      range?: string
      binary?: boolean
    } = {},
  ): Promise<T> {
    const timeout = options.timeoutMs ?? this.config.timeoutMs
    validateTimeout(timeout)
    const prefix = this.base.pathname.replace(/\/+$/, '')
    const url = new URL(this.base.origin)
    url.pathname = `${prefix}/api/v1/session/${segment(this.config.sessionId)}/${parts.map(segment).join('/')}`
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    const headers = new Headers({ 'x-api-key': this.config.apiKey })
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    if (body !== undefined) headers.set('content-type', 'application/json')
    if (options.range !== undefined) headers.set('range', options.range)
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(
            () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
            timeout,
          )
    const redact = (value: unknown): unknown => {
      if (typeof value === 'string') return value.split(this.config.apiKey).join('[REDACTED]')
      if (Array.isArray(value)) return value.map(redact)
      if (object(value))
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [String(redact(key)), redact(item)]),
        )
      return value
    }
    try {
      controller.signal.throwIfAborted()
      const response = await this.fetcher(url, {
        method,
        headers,
        body,
        redirect: 'error',
        signal: controller.signal,
      })
      // Also reject redirects from custom fetch implementations that ignore redirect:error.
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new ZappazError(response.status, 'UNSAFE_REDIRECT', 'Redirect da API rejeitado')
      }
      if (!response.ok) {
        let data: unknown
        let cause: unknown
        try {
          data = redact(await response.json())
        } catch (error) {
          if (controller.signal.aborted) cause = controller.signal.reason
          else if (!(error instanceof SyntaxError)) cause = error
        }
        const error = object(data) && object(data.error) ? data.error : undefined
        const safeHeaders = new Headers(response.headers)
        for (const [name, value] of safeHeaders) safeHeaders.set(name, String(redact(value)))
        throw new ZappazError(
          response.status,
          typeof error?.code === 'string' ? error.code : undefined,
          typeof error?.message === 'string' ? error.message : `HTTP ${response.status}`,
          error?.issues,
          safeHeaders.get('retry-after'),
          safeHeaders,
          cause === undefined ? undefined : { cause },
        )
      }
      if (options.binary)
        return {
          status: response.status,
          headers: response.headers,
          data: await response.arrayBuffer(),
        } as T
      try {
        return (await response.json()) as T
      } catch (error) {
        if (controller.signal.aborted || !(error instanceof SyntaxError)) throw error
        // Do not retain parser messages which can contain sensitive response excerpts.
        throw new ZappazProtocolError(
          response.status,
          response.headers,
          new SyntaxError('Invalid JSON response'),
        )
      }
    } catch (error) {
      if (error instanceof ZappazError || error instanceof ZappazProtocolError) throw error
      throw new ZappazNetworkError(controller.signal.aborted ? controller.signal.reason : error)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
}
