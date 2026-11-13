import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Zappaz } from '../dist/index.js'

// Synthetic JSON examples of the current producer contract, not raw protocol objects.
// Historical log retry payloads may use a different contract; they are not normalized here.
const session = { id: 'session-1', status: 'open', jid: '100@s.whatsapp.net' }
const secret = 'test-secret'
const reference = { id: 'm1', chatId: '123@g.us', remoteJid: null, lid: '456@lid', fromMe: false }
const baseMessage = { ...reference, id: '05b0a10a-cb46-4edf-b05d-60324044e985', messageId: 'm1', conversationId: 'a4cba58d-19b4-455c-85f1-118f65f334d7', isGroup: true, sender: { id: '456@lid', name: 'Alice' }, timestamp: '2026-01-01T00:00:00.000Z' }
const thumbnail = { mimeType: 'image/jpeg', base64: 'AA==', width: 1, height: 1 }
const vote = { voterId: '456@lid', fromMe: false, selectedOptions: ['A'], timestamp: null }
const messageVariants = {
  text: { text: 'hello', mentions: ['456@lid'], replyTo: { id: 'quoted', senderId: '456@lid', type: 'image', media: { mimeType: 'image/jpeg', thumbnail } }, interactive: { title: 'Choose', footer: null, buttons: [{ kind: 'reply', text: 'Yes', id: 'yes', url: null }] } },
  image: { text: 'caption', media: { mimeType: 'image/jpeg', size: 42, downloadPath: '/media/m1', thumbnail } },
  video: { media: { mimeType: 'video/mp4', duration: 3 } },
  audio: { media: { mimeType: 'audio/ogg', duration: 2, voice: true } },
  document: { media: { mimeType: 'application/pdf', fileName: 'example.pdf', size: 100 } },
  sticker: { media: { mimeType: 'image/webp' } },
  location: { location: { latitude: 0, longitude: -1, name: 'Place', address: 'Street', url: 'https://example.test/' } },
  contact: { contacts: [{ name: 'Alice', vcard: 'BEGIN:VCARD\nEND:VCARD', parsed: { name: 'Alice', firstName: 'Alice', lastName: null, phones: [{ number: '123', waid: '123', types: ['CELL'] }], emails: [], organization: null } }] },
  reaction: { reaction: { messageId: 'quoted', emoji: '👍' } },
  poll: { poll: { name: 'Choose', selectableOptionsCount: 1, options: [{ name: 'A', hash: 'hash', votes: 1 }], votes: [vote] } },
  album: { album: { expectedImageCount: 2, expectedVideoCount: 1 } },
  group_invite: { groupInvite: { groupJid: '123@g.us', name: 'Group', expiresAt: null, url: 'https://chat.whatsapp.com/example', thumbnail } },
  system: { system: { kind: 'disappearing_mode', duration: 86400, blocked: null } },
  unavailable: { unavailable: { reason: 'linked_device' } },
  unknown: {},
}

for (const event of ['inbound-message.upsert', 'outbound-message.upsert', 'messages.send']) {
  for (const key of ['id', 'messageId', 'conversationId']) {
    test(`${event} requires nullable ${key} without legacy fallback`, async () => {
      for (const invalid of [undefined, 42, {}]) {
        const { zappaz, events } = setup()
        const message = { ...baseMessage, type: 'text', [key]: invalid }
        assert.equal((await zappaz.handleWebhook(request({ event, session, payload: { message } }))).status, 400)
        assert.equal(events.length, 0)
      }
    })
  }
  test(`${event} preserves null persistence IDs for non-persisted reactions`, async () => {
    const { zappaz, events } = setup()
    const message = { ...baseMessage, id: null, conversationId: null, type: 'reaction', reaction: { messageId: 'target', emoji: '👍' } }
    assert.equal((await zappaz.handleWebhook(request({ event, session, payload: { message } }))).status, 204)
    assert.deepEqual(events[0].payload.message, message)
  })
}

test('quoted reply uses WhatsApp ID even without a persisted record', async () => {
  const zappaz = debouncedSetup(), sent = []
  zappaz.messages.sendText = async body => { sent.push(body); return { status: 'success' } }
  zappaz.onMessage('text', ctx => ctx.reply('answer', { quote: true }))
  assert.equal((await send(zappaz, { id: null, conversationId: null, messageId: 'wa-only' })).status, 204)
  assert.equal(sent[0].quoted, 'wa-only')
  assert.equal((await send(zappaz, { messageId: null })).status, 500)
  assert.equal(sent.length, 1)
})

function request(data) {
  return new Request('https://zappaz.example.test/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zappaz-webhook-secret': secret }, body: JSON.stringify(data) })
}
function setup() {
  const zappaz = new Zappaz({ baseUrl: 'https://api.example.test', apiKey: 'key', sessionId: session.id, webhookSecret: secret })
  const events = [], messages = []
  zappaz.onEvent(event => events.push(event))
  for (const type of Object.keys(messageVariants)) zappaz.onMessage(type, ctx => messages.push({ type, message: ctx.message, session: ctx.session, event: ctx.event }))
  return { zappaz, events, messages }
}

for (const [type, fields] of Object.entries(messageVariants)) {
  for (const event of ['inbound-message.upsert', 'outbound-message.upsert', 'messages.send']) {
    test(`${event} preserves ${type} and routes only inbound messages`, async () => {
      const { zappaz, events, messages } = setup()
      const message = { ...baseMessage, type, ...fields }
      const data = { event, payload: { message }, session }
      assert.equal((await zappaz.handleWebhook(request(data))).status, 204)
      assert.deepEqual(events, [data])
      assert.deepEqual(messages, event === 'inbound-message.upsert' ? [{ type, message, session, event }] : [])
    })
  }
}

test('selection, template replies and PN, LID, group and null identities survive dispatch', async () => {
  const { zappaz, events, messages } = setup()
  const variants = [
    { chatId: '123@s.whatsapp.net', remoteJid: '123@s.whatsapp.net', lid: null, isGroup: false, sender: { id: '123@s.whatsapp.net' }, selection: { kind: 'button', id: 'yes' }, templateReply: { selectedId: 'yes', selectedIndex: 0 } },
    { chatId: '456@lid', remoteJid: null, lid: '456@lid', isGroup: false, sender: { id: '456@lid' }, selection: { kind: 'list', id: null } },
    { id: null, messageId: null, conversationId: null, chatId: null, remoteJid: null, lid: null, isGroup: false, sender: { id: null }, timestamp: null },
    { chatId: '123@g.us', remoteJid: null, lid: null, isGroup: true, sender: { id: '456@lid' } },
  ]
  for (const fields of variants) {
    const message = { ...baseMessage, type: 'text', ...fields }
    const data = { event: 'inbound-message.upsert', payload: { message }, session }
    assert.equal((await zappaz.handleWebhook(request(data))).status, 204)
    assert.deepEqual(events.at(-1), data)
    assert.deepEqual(messages.at(-1).message, message)
  }
  assert.equal(messages.length, variants.length)
})

const payloads = {
  call: [{ id: 'call-1', from: '123@s.whatsapp.net', status: 'offer' }],
  'blocklist.set': { blocklist: ['123@s.whatsapp.net'] },
  'blocklist.update': { blocklist: ['123@s.whatsapp.net'], type: 'add' },
  'chats.delete': ['123@s.whatsapp.net'],
  // Registered names without a confirmed producer: test envelope acceptance only.
  'chats.phoneNumberShare': { synthetic: true },
  'chats.update': [{ id: '123@s.whatsapp.net', unreadCount: 0 }],
  'chats.upsert': [{ id: '123@s.whatsapp.net', name: 'Chat' }],
  'connection.update': { connection: 'open' },
  'contacts.update': [{ id: '456@lid', name: 'Alice' }],
  'contacts.upsert': [{ id: '123@s.whatsapp.net', name: 'Alice' }],
  'group-participants.update': { id: '123@g.us', participants: ['456@lid'], action: 'add' },
  'group.join-request': { synthetic: true },
  'groups.update': [{ id: '123@g.us', subject: 'Group' }],
  'groups.upsert': [{ id: '123@g.us', subject: 'Group' }],
  'labels.association': { type: 'add', association: { type: 'chat', chatId: '123@s.whatsapp.net', labelId: '1' } },
  'labels.edit': { id: '1', name: 'Label', color: 1 },
  'message-receipt.update': { receipts: [{ ...reference, recipientId: '456@lid', deliveredAt: '2026-01-01T00:00:00.000Z', readAt: null, playedAt: null }] },
  'messages.delete': { keys: [{ id: 'm1', remoteJid: '123@g.us', fromMe: false }] },
  'messages.media-update': [{ key: { id: 'm1', remoteJid: '123@g.us' }, media: { directPath: '/path' } }],
  'messages.reaction': { reactions: [{ ...reference, sender: { id: '456@lid', fromMe: false }, emoji: '👍', timestamp: null }] },
  'messages.update': { messages: [{ ...reference, status: 'read', pollVotes: [vote], location: { latitude: null, longitude: 0 } }] },
  'messaging-history.set': { chats: [], contacts: [], messages: [], isLatest: true },
  'presence.update': { id: '123@g.us', presences: { '456@lid': { lastKnownPresence: 'composing' } } },
}

for (const [event, payload] of Object.entries(payloads)) {
  test(`${event} preserves event payload without invoking message handlers`, async () => {
    const { zappaz, events, messages } = setup()
    const data = { event, payload, session }
    assert.equal((await zappaz.handleWebhook(request(data))).status, 204)
    assert.deepEqual(events, [data])
    assert.deepEqual(messages, [])
  })
}

test('own inbound messages reach onEvent but not onMessage', async () => {
  const { zappaz, events, messages } = setup()
  const data = { event: 'inbound-message.upsert', payload: { message: { ...baseMessage, fromMe: true, type: 'text', text: 'own' } }, session }
  assert.equal((await zappaz.handleWebhook(request(data))).status, 204)
  assert.deepEqual(events, [data])
  assert.deepEqual(messages, [])
})

// Debounced delivery uses real timers so these tests run in both Node and Bun.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for webhook handler')
    await sleep(5)
  }
}
function debouncedSetup(options = {}) {
  return new Zappaz({ baseUrl: 'https://api.example.test', apiKey: 'key', sessionId: session.id, webhookSecret: secret, ...options })
}
function delivery(message, event = 'inbound-message.upsert', eventSession = session) {
  return { event, payload: { message: { ...baseMessage, type: 'text', text: 'hello', ...message } }, session: eventSession }
}
async function send(zappaz, message, event, eventSession) {
  return zappaz.handleWebhook(request(delivery(message, event, eventSession)))
}

test('debounce resets for valid texts, dispatches after immediate handlers, and replies quoting the last message', async () => {
  const zappaz = debouncedSetup(), batches = [], immediate = [], sent = []
  zappaz.messages.sendText = async body => { sent.push(body); return {} }
  zappaz.onMessage('text', ctx => immediate.push(ctx.message.id))
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 100 }, async ctx => {
    batches.push(ctx)
    await ctx.reply('answer', { quote: true })
  })
  try {
    assert.equal((await send(zappaz, { id: 'first', messageId: 'wa-first', text: 'one' })).status, 204)
    await sleep(60)
    assert.equal((await send(zappaz, { id: 'last', messageId: 'wa-last', text: 'two' })).status, 204)
    await sleep(55)
    assert.equal(batches.length, 0)
    assert.deepEqual(immediate, ['first', 'last'])
    await waitFor(() => sent.length === 1)
    assert.deepEqual(batches[0].messages.map(m => m.id), ['first', 'last'])
    assert.deepEqual(batches[0].session, session)
    assert.equal(batches[0].event, 'inbound-message.upsert')
    assert.deepEqual(sent, [{ number: baseMessage.chatId, message: 'answer', quoted: 'wa-last' }])
  } finally { unsubscribe() }
})

test('batch keys separate group senders and chats; private messages use chat identity without sender', async () => {
  const zappaz = debouncedSetup(), batches = []
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 25 }, ctx => batches.push(ctx.messages.map(m => m.id)))
  try {
    for (const message of [
      { id: 'a1', sender: { id: 'a' } }, { id: 'b1', sender: { id: 'b' } },
      { id: 'a2', sender: { id: 'a' } }, { id: 'c', chatId: 'other@g.us', sender: { id: 'a' } },
      { id: 'p1', chatId: 'private', isGroup: false, sender: { id: null } },
      { id: 'p2', chatId: 'private', isGroup: false, sender: { id: '' } },
    ]) assert.equal((await send(zappaz, message)).status, 204)
    await waitFor(() => batches.length === 4)
    assert.deepEqual(batches.map(x => x.join(',')).sort(), ['a1,a2', 'b1', 'c', 'p1,p2'].sort())
  } finally { unsubscribe() }
})

test('non-text, blank text, own and outbound events do not enter or reset a batch', async () => {
  const zappaz = debouncedSetup(), batches = []
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 100 }, ctx => batches.push(ctx.messages.map(m => m.id)))
  try {
    await send(zappaz, { id: 'valid' })
    await sleep(60)
    for (const [message, event] of [
      [{ id: 'image', type: 'image', text: 'caption' }], [{ id: 'blank', text: '  \n ' }],
      [{ id: 'missing', text: undefined }], [{ id: 'own', fromMe: true }],
      [{ id: 'outbound' }, 'outbound-message.upsert'], [{ id: 'sent' }, 'messages.send'],
    ]) assert.equal((await send(zappaz, message, event)).status, 204)
    await sleep(55)
    assert.deepEqual(batches, [['valid']])
    await sleep(110)
    assert.deepEqual(batches, [['valid']])
  } finally { unsubscribe() }
})

test('invalid batching identities report webhook errors; immediate handler failure does not enqueue', async () => {
  const errors = [], batches = [], zappaz = debouncedSetup({ onWebhookError: e => errors.push(e) })
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 20 }, ctx => batches.push(ctx))
  try {
    assert.equal((await send(zappaz, { chatId: null })).status, 500)
    assert.equal((await send(zappaz, { sender: { id: null } })).status, 500)
    assert.equal(errors.length, 2)
    zappaz.onMessage('text', () => { throw new Error('immediate') })
    assert.equal((await send(zappaz, { id: 'fail' })).status, 500)
    await sleep(60)
    assert.equal(batches.length, 0)
    assert.equal(errors.length, 3)
  } finally { unsubscribe() }
})

test('same-key batches serialize, errors are observed, and later batches recover', async () => {
  const errors = [], started = [], zappaz = debouncedSetup({ onWebhookError: e => errors.push(e) })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 20 }, async ctx => {
    started.push(ctx.messages[0].id)
    if (ctx.messages[0].id === 'first') { await gate; throw new Error('batch failed') }
  })
  try {
    await send(zappaz, { id: 'first' })
    await waitFor(() => started.length === 1)
    await send(zappaz, { id: 'second' })
    await sleep(60)
    assert.deepEqual(started, ['first'])
    release()
    await waitFor(() => started.length === 2 && errors.length === 1)
    assert.deepEqual(started, ['first', 'second'])
    assert.equal(errors[0].message, 'batch failed')
    await send(zappaz, { id: 'third' })
    await waitFor(() => started.length === 3)
  } finally { release(); unsubscribe() }
})

test('registrations are isolated; unsubscribe cancels pending and queued work but not running handlers', async () => {
  const zappaz = debouncedSetup(), a = [], b = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const stopA = zappaz.onTextDebounced({ delayMs: 20 }, async ctx => { a.push(ctx.messages[0].id); await gate; a.push('finished') })
  const stopB = zappaz.onTextDebounced({ delayMs: 20 }, ctx => b.push(ctx.messages[0].id))
  try {
    await send(zappaz, { id: 'first' })
    await waitFor(() => a.length === 1 && b.length === 1)
    await send(zappaz, { id: 'queued' })
    await waitFor(() => b.length === 2)
    await send(zappaz, { id: 'pending', chatId: 'other@g.us' })
    stopA(); stopA()
    release()
    await waitFor(() => a.includes('finished'))
    await waitFor(() => b.length === 3)
    await sleep(40)
    assert.deepEqual(a, ['first', 'finished'])
    assert.deepEqual(b, ['first', 'queued', 'pending'])
  } finally { release(); stopA(); stopB() }
})

test('debounce rejects invalid delay values', () => {
  const zappaz = debouncedSetup()
  for (const delayMs of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.throws(() => zappaz.onTextDebounced({ delayMs }, () => {}))
  }
  const unsubscribe = zappaz.onTextDebounced({ delayMs: 2147483647 }, () => {})
  assert.equal(typeof unsubscribe, 'function')
  unsubscribe()
})

test('payload logging is opt-in, callback replaces debug and receives an isolated validated envelope', async () => {
  const original = console.debug, logs = [], observed = [], dispatched = []
  console.debug = (...args) => logs.push(args)
  try {
    const quiet = debouncedSetup()
    assert.equal((await send(quiet, {})).status, 204)
    assert.equal(logs.length, 0)
    const zappaz = debouncedSetup({ logWebhookPayloads: true, onWebhookPayload: event => {
      observed.push(structuredClone(event))
      event.payload.message.text = 'mutated'
      event.session.id = 'mutated'
    } })
    zappaz.onMessage('text', ctx => dispatched.push([ctx.message.text, ctx.session.id]))
    const data = delivery({ text: 'original' })
    assert.equal((await zappaz.handleWebhook(request(data))).status, 204)
    assert.deepEqual(observed, [data])
    assert.deepEqual(dispatched, [['original', session.id]])
    assert.equal(logs.length, 0)
    const callbackOnly = debouncedSetup({ onWebhookPayload: event => observed.push(event) })
    await send(callbackOnly, {})
    assert.equal(observed.length, 2)
    const debug = debouncedSetup({ logWebhookPayloads: true })
    await send(debug, {})
    assert.equal(logs.length, 1)
  } finally { console.debug = original }
})

test('logger failures are observed without preventing dispatch; rejected requests never log', async () => {
  const errors = [], seen = [], failure = new Error('logging failed')
  const zappaz = debouncedSetup({ onWebhookPayload: async () => { throw failure }, onWebhookError: async e => { errors.push(e); throw new Error('observer failed') } })
  zappaz.onMessage('text', ctx => seen.push(ctx.message.id))
  assert.equal((await send(zappaz, { id: 'ok' })).status, 204)
  assert.deepEqual(errors, [failure])
  assert.deepEqual(seen, ['ok'])
  const logged = [], other = debouncedSetup({ onWebhookPayload: e => logged.push(e) })
  const unauthorized = new Request('https://zappaz.example.test/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zappaz-webhook-secret': 'wrong' }, body: JSON.stringify(delivery({})) })
  assert.equal((await other.handleWebhook(unauthorized)).status, 401)
  assert.equal((await other.handleWebhook(request({ ...delivery({}), session: { ...session, id: 'other' } }))).status, 403)
  assert.equal((await other.handleWebhook(request({ ...delivery({}), event: 'unknown' }))).status, 422)
  assert.equal((await other.handleWebhook(request({ ...delivery({}), payload: { message: {} } }))).status, 400)
  assert.equal((await other.handleWebhook(request({ event: 'call' }))).status, 400)
  assert.deepEqual(logged, [])
})
