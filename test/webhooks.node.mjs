import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Zappaz } from '../dist/index.js'

// Synthetic JSON examples of the current producer contract, not raw protocol objects.
// Historical log retry payloads may use a different contract; they are not normalized here.
const session = { id: 'session-1', status: 'open', jid: '100@s.whatsapp.net' }
const secret = 'test-secret'
const reference = { id: 'm1', chatId: '123@g.us', remoteJid: null, lid: '456@lid', fromMe: false }
const baseMessage = { ...reference, isGroup: true, sender: { id: '456@lid', name: 'Alice' }, timestamp: '2026-01-01T00:00:00.000Z' }
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
    { id: null, chatId: null, remoteJid: null, lid: null, isGroup: false, sender: { id: null }, timestamp: null },
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
