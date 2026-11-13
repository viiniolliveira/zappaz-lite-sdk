import { describe, expect, test } from 'bun:test'
import { Zappaz } from '../src/index'

const baseUrl = 'https://api.example.test'
const apiKey = 'test-api-key'
const sessionId = 'session/with @chars'
const secret = 'test-webhook-secret'

function setup(response: () => Response = () => Response.json({ status: 'success', message: { id: 'sent' } })) {
  const requests: Request[] = []
  const fetcher: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init))
    return response()
  }
  const sdk = new Zappaz({ baseUrl, apiKey, sessionId, webhookSecret: secret, fetch: fetcher })
  return { sdk, requests }
}

function event(overrides: Record<string, unknown> = {}, messageOverrides: Record<string, unknown> = {}) {
  return {
    event: 'inbound-message.upsert',
    payload: { message: {
      id: '05b0a10a-cb46-4edf-b05d-60324044e985', messageId: 'message-1', conversationId: 'a4cba58d-19b4-455c-85f1-118f65f334d7', chatId: 'group@g.us', remoteJid: null, lid: 'user@lid',
      fromMe: false, isGroup: true, sender: { id: 'user@lid', name: 'User' },
      timestamp: '2026-10-30T23:20:00.000Z', type: 'text', text: 'Olá',
      ...messageOverrides,
    } },
    session: { id: sessionId, status: 'open', jid: 'bot@s.whatsapp.net' },
    ...overrides,
  }
}

function webhook(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://zappaz.example.test/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-zappaz-webhook-secret': secret, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function isSuccess(response: Response) { return response.status >= 200 && response.status < 300 }

describe('HTTP transport', () => {
  test('sends text with encoded session, API key and exact JSON; preserves response', async () => {
    const result = { status: 'success', message: { key: { id: 'ABC' } } }
    const { sdk, requests } = setup(() => Response.json(result))
    const input = { number: '5511999999999@s.whatsapp.net', message: 'Olá', quoted: 'quoted-id', linkPreview: false }
    expect(await sdk.messages.sendText(input)).toEqual(result)
    expect(requests).toHaveLength(1)
    const request = requests[0]!
    expect(request.url).toBe(`${baseUrl}/api/v1/session/${encodeURIComponent(sessionId)}/message/text`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('x-api-key')).toBe(apiKey)
    expect(request.headers.get('authorization')).toBeNull()
    expect(request.headers.get('content-type')).toContain('application/json')
    expect(await request.json()).toEqual(input)
  })

  test('sends participant array directly and encodes group JID as a segment', async () => {
    const result = [{ jid: 'user@s.whatsapp.net', status: '200' }]
    const { sdk, requests } = setup(() => Response.json(result))
    const jid = 'group/123@g.us'
    const participants = ['user@s.whatsapp.net', 'other@lid']
    expect(await sdk.groups.addParticipants(jid, participants)).toEqual(result)
    expect(requests[0]!.url).toBe(`${baseUrl}/api/v1/session/${encodeURIComponent(sessionId)}/group/${encodeURIComponent(jid)}/add`)
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.headers.get('x-api-key')).toBe(apiKey)
    expect(await requests[0]!.json()).toEqual(participants)
  })

  test('forwards Range on binary GET without a body', async () => {
    const { sdk, requests } = setup(() => new Response(new Uint8Array([1, 2, 3]), {
      status: 206, headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-2/10', 'accept-ranges': 'bytes', 'content-length': '3' },
    }))
    await sdk.messages.getMediaBinary('id/1@server', { range: 'bytes=0-2' })
    const request = requests[0]!
    expect(request.url).toBe(`${baseUrl}/api/v1/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent('id/1@server')}/media/binary`)
    expect(request.method).toBe('GET')
    expect(request.headers.get('range')).toBe('bytes=0-2')
    expect(request.headers.get('x-api-key')).toBe(apiKey)
    expect(request.body).toBeNull()
  })

  test('surfaces HTTP errors without retrying writes or leaking the API key', async () => {
    const { sdk, requests } = setup(() => Response.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429, headers: { 'retry-after': '10' } }))
    let error: unknown
    try { await sdk.messages.sendText({ number: '123', message: 'hello' }) } catch (caught) { error = caught }
    expect(error).toBeDefined()
    expect(String(error)).not.toContain(apiKey)
    expect(requests).toHaveLength(1)
  })

  test('does not retry a write after a network failure', async () => {
    let calls = 0
    const sdk = new Zappaz({ baseUrl, apiKey, sessionId, fetch: async () => { calls++; throw new Error('network down') } })
    await expect(sdk.messages.sendText({ number: '123', message: 'hello' })).rejects.toThrow()
    expect(calls).toBe(1)
  })
})

describe('webhook and reply', () => {
  test('dispatches incoming text and replies to group chat, with explicit quote only', async () => {
    const { sdk, requests } = setup()
    let seen = 0
    sdk.onMessage('text', async (ctx) => {
      seen++
      expect(ctx.message.chatId).toBe('group@g.us')
      expect(ctx.session.id).toBe(sessionId)
      expect(ctx.event).toBe('inbound-message.upsert')
      await ctx.reply('plain')
      await ctx.reply('quoted', { quote: true })
    })
    expect(isSuccess(await sdk.handleWebhook(webhook(event())))).toBe(true)
    expect(seen).toBe(1)
    expect(requests).toHaveLength(2)
    expect(await requests[0]!.json()).toEqual({ number: 'group@g.us', message: 'plain' })
    expect(await requests[1]!.json()).toEqual({ number: 'group@g.us', message: 'quoted', quoted: 'message-1' })
  })

  test('rejects incorrect or missing secret and mismatched session without dispatch', async () => {
    const { sdk } = setup()
    let calls = 0
    sdk.onMessage('text', () => { calls++ })
    const missing = new Request('https://zappaz.example.test/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event()) })
    expect(isSuccess(await sdk.handleWebhook(missing))).toBe(false)
    expect(isSuccess(await sdk.handleWebhook(webhook(event(), { 'x-zappaz-webhook-secret': 'wrong' })))).toBe(false)
    expect(isSuccess(await sdk.handleWebhook(webhook(event({ session: { id: 'another-session' } })) ))).toBe(false)
    expect(calls).toBe(0)
  })

  test('rejects invalid JSON, invalid envelope, unsupported method and content type', async () => {
    const { sdk } = setup()
    let calls = 0
    sdk.onMessage('text', () => { calls++ })
    expect(isSuccess(await sdk.handleWebhook(webhook('{')))).toBe(false)
    expect(isSuccess(await sdk.handleWebhook(webhook({ event: 'inbound-message.upsert' })))).toBe(false)
    expect(isSuccess(await sdk.handleWebhook(new Request('https://zappaz.example.test/webhook', { headers: { 'x-zappaz-webhook-secret': secret } })))).toBe(false)
    expect(isSuccess(await sdk.handleWebhook(webhook(event(), { 'content-type': 'text/plain' })))).toBe(false)
    expect(calls).toBe(0)
  })

  test('never dispatches outbound, own, other-type or unknown events as inbound text', async () => {
    const { sdk } = setup()
    let calls = 0
    sdk.onMessage('text', () => { calls++ })
    for (const payload of [
      event({ event: 'outbound-message.upsert' }), event({ event: 'messages.send' }),
      event({ event: 'unknown.event' }), event({}, { fromMe: true }), event({}, { type: 'image' }),
    ]) await sdk.handleWebhook(webhook(payload))
    expect(calls).toBe(0)
  })

  test('runs handlers in registration order and returns failure on handler error', async () => {
    const { sdk } = setup()
    const calls: number[] = []
    sdk.onMessage('text', () => { calls.push(1) })
    sdk.onMessage('text', () => { calls.push(2); throw new Error('handler failed') })
    sdk.onMessage('text', () => { calls.push(3) })
    expect(isSuccess(await sdk.handleWebhook(webhook(event())))).toBe(false)
    expect(calls).toEqual([1, 2])
  })

  test('reply fails rather than inventing a destination when chatId is null', async () => {
    const { sdk, requests } = setup()
    sdk.onMessage('text', async (ctx) => { await ctx.reply('hello') })
    expect(isSuccess(await sdk.handleWebhook(webhook(event({}, { chatId: null }))))).toBe(false)
    expect(requests).toHaveLength(0)
  })

  test('quoted reply fails when message ID is null', async () => {
    const { sdk, requests } = setup()
    sdk.onMessage('text', async (ctx) => { await ctx.reply('hello', { quote: true }) })
    expect(isSuccess(await sdk.handleWebhook(webhook(event({}, { messageId: null })) ))).toBe(false)
    expect(requests).toHaveLength(0)
  })

  test('processes duplicate deliveries independently', async () => {
    const { sdk } = setup()
    let calls = 0
    sdk.onMessage('text', () => { calls++ })
    expect(isSuccess(await sdk.handleWebhook(webhook(event())))).toBe(true)
    expect(isSuccess(await sdk.handleWebhook(webhook(event())))).toBe(true)
    expect(calls).toBe(2)
  })
})
