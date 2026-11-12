import { Zappaz, type Fetch } from '../src/index.js'

const fetcher: Fetch = async (_input: string | URL | Request, _init?: RequestInit) => new Response('{}')
const zappaz = new Zappaz({
  baseUrl: 'https://api.example.test', apiKey: 'fake-key', sessionId: 'fake-session', fetch: fetcher,
  onWebhookError: async (error: unknown) => { void error },
})
zappaz.onMessage('text', ctx => {
  const type: 'text' = ctx.message.type
  const text: string | undefined = ctx.message.text
  void type; void text
  // @ts-expect-error text may be absent even for a text message
  const required: string = ctx.message.text
  void required
})
zappaz.onMessage('image', ctx => {
  const type: 'image' = ctx.message.type
  void type
})

async function responseTypes() {
  const page = await zappaz.webhooks.list()
  const pageString: string = page.page
  const pageSizeString: string = page.pageSize
  const total: number = page.total
  // @ts-expect-error backend pagination is serialized as strings
  const numericPage: number = page.page
  const logs = await zappaz.webhooks.listLogs('hook')
  const logPage: string = logs.page
  const log = await zappaz.webhooks.getLog('hook', 'log')
  const logId: string = log.id
  const picture = await zappaz.profile.getPicture('contact')
  const pictureUrl: string = picture.url
  const base64: string = picture.base64
  const result = await zappaz.contacts.isOnWhatsApp('contact')
  const exists: boolean | undefined = result.isOnWhatsApp
  const media = await zappaz.messages.getMediaBase64('message')
  const mimeType: string | null = media.data.mimeType
  const fileName: string | null = media.data.fileName
  const edited: unknown = (await zappaz.messages.editText('message', {text:'updated'})).data
  void [pageString, pageSizeString, total, numericPage, logPage, logId, pictureUrl, base64, exists, mimeType, fileName, edited]
}
void responseTypes
