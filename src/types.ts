export interface MessageBase {
  number: string
  mentions?: string[]
  quoted?: string
  delay?: number
}
export interface SendText extends MessageBase {
  message: string
  linkPreview?: boolean
  signMessage?: boolean
  signatureName?: string
}
export interface SendImage extends MessageBase {
  source: string
  fileName?: string
  caption?: string
}
export interface SendVideo extends SendImage {
  gifPlayback?: boolean
}
export type SendDocument = SendImage
export interface SendAudio extends MessageBase {
  source: string
  caption?: string
  asVoiceNote?: boolean
}
export interface SendContact extends MessageBase {
  contact: {
    firstName: string
    lastName: string
    phoneNumber: string
    displayName?: string
    organization?: string
    url?: string
    email?: string
  }
}
export interface SendLocation extends MessageBase {
  location: {
    degreesLatitude?: number
    degreesLongitude?: number
    name?: string
    address?: string
    url?: string
    comment?: string
  }
}
export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}
export interface SendResult {
  status: 'success'
  message?: unknown
}
export interface StatusMessage {
  status: 'success'
  message: string
}
export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'reaction',
  'poll',
  'album',
  'group_invite',
  'system',
  'unavailable',
  'unknown',
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]
export interface NormalizedMessage {
  id: string | null
  chatId: string | null
  remoteJid: string | null
  lid: string | null
  fromMe: boolean
  isGroup: boolean
  sender: { id: string | null; name?: string }
  timestamp: string | null
  type: MessageType
  text?: string
  media?: {
    mimeType?: string
    fileName?: string
    size?: number
    duration?: number
    voice?: boolean
    downloadPath?: string
    thumbnail?: { mimeType: 'image/jpeg'; base64: string; width: number; height: number }
  }
  location?: {
    latitude?: number
    longitude?: number
    name?: string
    address?: string
    url?: string
  }
  status?: MessageStatus
  mentions?: string[]
  replyTo?: MessageReply
  [key: string]: unknown
}
export interface MessageReply {
  id: string
  senderId?: string
  type?: MessageType
  text?: string
  [key: string]: unknown
}
export type MessageStatus = 'error' | 'pending' | 'sent' | 'delivered' | 'read' | 'played'
export interface WebhookSession {
  id: string
  status: string
  jid: string | null
  [key: string]: unknown
}
export interface WebhookEnvelope {
  event: string
  payload: unknown
  session: WebhookSession
}
export const WEBHOOK_EVENTS = [
  'call',
  'blocklist.set',
  'blocklist.update',
  'chats.delete',
  'chats.phoneNumberShare',
  'chats.update',
  'chats.upsert',
  'connection.update',
  'contacts.update',
  'contacts.upsert',
  'group-participants.update',
  'group.join-request',
  'groups.update',
  'groups.upsert',
  'labels.association',
  'labels.edit',
  'message-receipt.update',
  'messages.delete',
  'messages.media-update',
  'messages.reaction',
  'messages.send',
  'messages.update',
  'messaging-history.set',
  'presence.update',
  'inbound-message.upsert',
  'outbound-message.upsert',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
export interface CreateWebhook {
  url: string
  displayName?: string
  events: Partial<Record<WebhookEvent, boolean>>
  enabled?: boolean
  headers?: Record<string, string>
  secret?: string | null
}
export type UpdateWebhook = Partial<CreateWebhook>
export interface Pagination {
  page?: string
  pageSize?: string
}
export interface LogQuery extends Pagination {
  event?: string
  status?: string
  startDate?: string
  endDate?: string
}
export interface CreateGroup {
  subject: string
  description?: string
  participants?: string[]
}
export interface UpdateGroup {
  subject?: string
  description?: string
  onlyAdminsCanPost?: boolean
  onlyAdminsCanEditInfo?: boolean
}
export type Privacy = 'contacts' | 'all' | 'contact_blacklist' | 'none'
export type DisappearingMode = 'ONE_DAY' | 'ONE_WEEK' | 'THREE_MONTHS' | 'OFF'

/** JSON dates are ISO strings, not Date objects. Headers and secret are sensitive. */
export interface Webhook {
  id: string
  url: string
  enabled: boolean
  createdAt: string
  events: Partial<Record<WebhookEvent, boolean>>
  waSessionId: string
  headers: Record<string, string>
  displayName: string | null
  secret: string | null
}

export interface WebhookLog {
  id: string
  webhookId: string
  createdAt: string
  response: unknown
  url: string | null
  event: string | null
  sessionId: string | null
  webhookDisplayName: string | null
  waSessionEventId: string | null
  payload: unknown
  messageId: string | null
  parentLogId: string | null
}
