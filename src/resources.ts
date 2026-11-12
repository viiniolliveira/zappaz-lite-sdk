import { HttpClient } from './http.js'
import type {
  CreateGroup,
  CreateWebhook,
  DisappearingMode,
  LogQuery,
  Pagination,
  Privacy,
  RequestOptions,
  SendAudio,
  SendContact,
  SendDocument,
  SendImage,
  SendLocation,
  SendResult,
  SendText,
  SendVideo,
  StatusMessage,
  UpdateGroup,
  UpdateWebhook,
  Webhook,
  WebhookLog,
} from './types.js'

type Data<T> = { status: 'success'; data: T }
type Page<T> = Data<T[]> & { page: string; pageSize: string; total: number }
export type BinaryMedia = { status: number; headers: Headers; data: ArrayBuffer }
export class Messages {
  constructor(private http: HttpClient) {}
  sendText(body: SendText, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'text'], { ...options, body })
  }
  sendImage(body: SendImage, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'image'], { ...options, body })
  }
  sendVideo(body: SendVideo, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'video'], { ...options, body })
  }
  sendAudio(body: SendAudio, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'audio'], { ...options, body })
  }
  sendDocument(body: SendDocument, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'document'], { ...options, body })
  }
  sendContact(body: SendContact, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'contact'], { ...options, body })
  }
  sendLocation(body: SendLocation, options?: RequestOptions) {
    return this.http.request<SendResult>('POST', ['message', 'location'], { ...options, body })
  }
  editText(id: string, body: { text: string }, options?: RequestOptions) {
    return this.http.request<Data<unknown>>('PATCH', ['message', id], { ...options, body })
  }
  deleteForEveryone(id: string, options?: RequestOptions) {
    return this.http.request<{ status: 'success'; deleted?: unknown }>(
      'DELETE',
      ['message', id],
      options,
    )
  }
  getMediaBase64(id: string, options?: RequestOptions) {
    return this.http.request<
      Data<{ media: string; mimeType: string | null; fileName: string | null }>
    >('GET', ['message', id, 'media', 'base64'], options)
  }
  getMediaBinary(id: string, options?: RequestOptions & { range?: string }) {
    return this.http.request<BinaryMedia>('GET', ['message', id, 'media', 'binary'], {
      ...options,
      binary: true,
    })
  }
}
export class Groups {
  constructor(private http: HttpClient) {}
  list(options?: RequestOptions) {
    return this.http.request<unknown[]>('GET', ['group'], options)
  }
  create(body: CreateGroup, options?: RequestOptions) {
    return this.http.request<unknown>('POST', ['group'], { ...options, body })
  }
  update(jid: string, body: UpdateGroup, options?: RequestOptions) {
    return this.http.request<StatusMessage>('PUT', ['group', jid], { ...options, body })
  }
  sendInvite(jid: string, body: { number: string; message?: string }, options?: RequestOptions) {
    return this.http.request<{ status: 'success'; message?: unknown }>(
      'POST',
      ['group', jid, 'send-invite'],
      { ...options, body },
    )
  }
  private participants(action: string, jid: string, body: string[], options?: RequestOptions) {
    return this.http.request<unknown>('POST', ['group', jid, action], { ...options, body })
  }
  addParticipants(jid: string, body: string[], options?: RequestOptions) {
    return this.participants('add', jid, body, options)
  }
  removeParticipants(jid: string, body: string[], options?: RequestOptions) {
    return this.participants('remove', jid, body, options)
  }
  promoteParticipants(jid: string, body: string[], options?: RequestOptions) {
    return this.participants('promote', jid, body, options)
  }
  demoteParticipants(jid: string, body: string[], options?: RequestOptions) {
    return this.participants('demote', jid, body, options)
  }
  getInviteCode(jid: string, options?: RequestOptions) {
    return this.http.request<{ status: 'success'; inviteCode: string; inviteUrl: string }>(
      'POST',
      ['group', jid, 'invite-code'],
      options,
    )
  }
  revokeInviteCode(jid: string, options?: RequestOptions) {
    return this.http.request<
      StatusMessage & { newInviteCode?: string | null; newInviteCodeUrl: string }
    >('POST', ['group', jid, 'invite-code-revoke'], options)
  }
  leave(jid: string, options?: RequestOptions) {
    return this.http.request<StatusMessage>('POST', ['group', jid, 'leave'], options)
  }
}
export class Profile {
  constructor(private http: HttpClient) {}
  getPicture(identifier: string, options?: RequestOptions) {
    return this.http.request<{ url: string; base64: string }>('GET', ['display-picture'], {
      ...options,
      query: { identifier },
    })
  }
  updatePicture(body: { identifier: string; source: string }, options?: RequestOptions) {
    return this.http.request<StatusMessage>('PUT', ['display-picture'], { ...options, body })
  }
  updateName(body: { name: string }, options?: RequestOptions) {
    return this.http.request<StatusMessage & { name: string }>('PUT', ['update-profile-name'], {
      ...options,
      body,
    })
  }
  updateStatus(body: { status: string }, options?: RequestOptions) {
    return this.http.request<StatusMessage & { profileStatus: string }>(
      'PUT',
      ['update-profile-status'],
      { ...options, body },
    )
  }
}
export class Contacts {
  constructor(private http: HttpClient) {}
  isOnWhatsApp(jid: string, options?: RequestOptions) {
    return this.http.request<{ isOnWhatsApp?: boolean }>('GET', ['is-on-whatsapp', jid], options)
  }
  getAbout(jid: string, options?: RequestOptions) {
    return this.http.request<unknown>('GET', ['get-about', jid], options)
  }
  block(jid: string, options?: RequestOptions) {
    return this.http.request<StatusMessage>('PUT', ['block-contact', jid], options)
  }
  unblock(jid: string, options?: RequestOptions) {
    return this.http.request<StatusMessage>('PUT', ['unblock-contact', jid], options)
  }
}
export class PrivacySettings {
  constructor(private http: HttpClient) {}
  get(options?: RequestOptions) {
    return this.http.request<unknown>('GET', ['privacy'], options)
  }
  private set<T extends string>(path: string, privacy: T, options?: RequestOptions) {
    return this.http.request<StatusMessage & { privacy: T }>('PUT', ['privacy', path], {
      ...options,
      body: { privacy },
    })
  }
  setLastSeen(privacy: Privacy, options?: RequestOptions) {
    return this.set('last-seen', privacy, options)
  }
  setOnline(privacy: 'all' | 'match_last_seen', options?: RequestOptions) {
    return this.set('online', privacy, options)
  }
  setProfilePicture(privacy: Privacy, options?: RequestOptions) {
    return this.set('profile-picture', privacy, options)
  }
  setStatus(privacy: Privacy, options?: RequestOptions) {
    return this.set('status', privacy, options)
  }
  setReadReceipts(privacy: 'all' | 'none', options?: RequestOptions) {
    return this.set('read-receipts', privacy, options)
  }
  setGroupsAdd(privacy: 'all' | 'contacts' | 'contact_blacklist', options?: RequestOptions) {
    return this.set('groups-add', privacy, options)
  }
  setDisappearingMode(mode: DisappearingMode, options?: RequestOptions) {
    return this.http.request<StatusMessage & { mode: DisappearingMode }>(
      'PUT',
      ['privacy', 'default-disappearing-mode'],
      { ...options, body: { mode } },
    )
  }
}
export class Webhooks {
  constructor(private http: HttpClient) {}
  list(query?: Pagination, options?: RequestOptions) {
    return this.http.request<Page<Webhook>>('GET', ['webhook'], { ...options, query })
  }
  create(body: CreateWebhook, options?: RequestOptions) {
    return this.http.request<Data<Webhook>>('POST', ['webhook'], { ...options, body })
  }
  get(id: string, options?: RequestOptions) {
    return this.http.request<Data<Webhook>>('GET', ['webhook', id], options)
  }
  update(id: string, body: UpdateWebhook, options?: RequestOptions) {
    return this.http.request<Data<Webhook>>('PUT', ['webhook', id], { ...options, body })
  }
  delete(id: string, options?: RequestOptions) {
    return this.http.request<StatusMessage>('DELETE', ['webhook', id], options)
  }
  listLogs(id: string, query?: LogQuery, options?: RequestOptions) {
    return this.http.request<Page<WebhookLog>>('GET', ['webhook', id, 'logs'], {
      ...options,
      query,
    })
  }
  getLog(id: string, logId: string, options?: RequestOptions) {
    return this.http.request<WebhookLog>('GET', ['webhook', id, 'logs', logId], options)
  }
  retryLog(id: string, logId: string, options?: RequestOptions) {
    return this.http.request<Data<WebhookLog>>(
      'POST',
      ['webhook', id, 'logs', logId, 'retry'],
      options,
    )
  }
}
