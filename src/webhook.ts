import { MESSAGE_TYPES, type NormalizedMessage, type WebhookEnvelope } from './types.js'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown) => typeof value === 'string'
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const boolean = (value: unknown) => typeof value === 'boolean'
const nullableString = (value: unknown) => value === null || string(value)
const optional = (value: unknown, validate: (value: unknown) => boolean) =>
  value === undefined || validate(value)
const messageType = (value: unknown) => MESSAGE_TYPES.some((type) => type === value)
const status = (value: unknown) =>
  ['error', 'pending', 'sent', 'delivered', 'read', 'played'].includes(value as string)

function validMedia(value: unknown): boolean {
  if (!isObject(value)) return false
  return (
    ['mimeType', 'fileName', 'downloadPath'].every((key) => optional(value[key], string)) &&
    ['size', 'duration'].every((key) => optional(value[key], number)) &&
    optional(value.voice, boolean) &&
    optional(
      value.thumbnail,
      (thumbnail) =>
        isObject(thumbnail) &&
        thumbnail.mimeType === 'image/jpeg' &&
        string(thumbnail.base64) &&
        number(thumbnail.width) &&
        number(thumbnail.height),
    )
  )
}

/** Validate all fields that are exposed as typed values; opaque fields stay unknown. */
export function validMessage(value: unknown): value is NormalizedMessage {
  if (!isObject(value)) return false
  return (
    ['id', 'chatId', 'remoteJid', 'lid', 'timestamp'].every((key) => nullableString(value[key])) &&
    boolean(value.fromMe) &&
    boolean(value.isGroup) &&
    isObject(value.sender) &&
    nullableString(value.sender.id) &&
    optional(value.sender.name, string) &&
    messageType(value.type) &&
    optional(value.text, string) &&
    optional(value.status, status) &&
    optional(value.media, validMedia) &&
    optional(value.mentions, (mentions) => Array.isArray(mentions) && mentions.every(string)) &&
    optional(
      value.location,
      (location) =>
        isObject(location) &&
        ['latitude', 'longitude'].every((key) => optional(location[key], number)) &&
        ['name', 'address', 'url'].every((key) => optional(location[key], string)),
    ) &&
    optional(
      value.replyTo,
      (reply) =>
        isObject(reply) &&
        string(reply.id) &&
        optional(reply.senderId, string) &&
        optional(reply.type, messageType) &&
        optional(reply.text, string),
    )
  )
}

export function validEnvelope(value: unknown): value is WebhookEnvelope {
  return (
    isObject(value) &&
    typeof value.event === 'string' &&
    Object.hasOwn(value, 'payload') &&
    isObject(value.session) &&
    typeof value.session.id === 'string' &&
    value.session.id.length > 0 &&
    typeof value.session.status === 'string' &&
    nullableString(value.session.jid)
  )
}

/** This is a shared-secret comparison, not verification of a signed delivery. */
export async function equalSecret(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const left = new Uint8Array(x),
    right = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export class WebhookBodyTooLarge extends Error {}

export async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        // A cancellation failure must not replace the size-limit error.
        try {
          await reader.cancel()
        } catch {
          /* retain 413 */
        }
        throw new WebhookBodyTooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
