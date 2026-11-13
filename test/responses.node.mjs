import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Zappaz } from '../dist/index.js'

// Synthetic examples of the backend's different response shapes, not recorded data.
const webhook = { id:'hook-1', url:'https://example.test/hook', enabled:true, createdAt:'2026-01-01T00:00:00.000Z', events:{call:true}, waSessionId:'session-1', headers:{}, displayName:null, secret:null }
const log = { id:'log-1', webhookId:'hook-1', createdAt:'2026-01-02T00:00:00.000Z', response:{status:204}, url:'https://example.test/hook', event:'call', sessionId:'session-1', webhookDisplayName:null, waSessionEventId:null, payload:{}, messageId:null, parentLogId:null }
const participantResults = [{jid:'a@example.test',status:'200'}, {jid:'b@example.test',status:'403'}]
const fixtures = [
 ['messages.list empty', z => z.messages.list(), {status:'success',data:[],page:{hasMore:false,nextCursor:null},boundaries:{first:null,last:null}}],
 ['messages.list cursor', z => z.messages.list({after:'opaque',limit:1}), {status:'success',data:[{id:'record',messageId:'wa',conversationId:'conversation',sessionId:'session-1',media:null}],page:{hasMore:true,nextCursor:'next'},boundaries:{first:'first',last:'last'}}],
 ['messages.get', z => z.messages.get('wa',{phoneNumber:'5511999999999'}), {status:'success',data:{id:'record',messageId:'wa',conversationId:'conversation',sessionId:'session-1',media:{contentPath:'/media/record'},metadata:{preserved:true}}}],
 ['webhooks.list', z => z.webhooks.list({page:'2',pageSize:'10'}), {status:'success',data:[webhook],page:'2',pageSize:'10',total:12}],
 ['webhooks.listLogs', z => z.webhooks.listLogs('hook-1',{page:'3',pageSize:'5'}), {status:'success',data:[log],page:'3',pageSize:'5',total:11}],
 ['webhooks.getLog', z => z.webhooks.getLog('hook-1','log-1'), log],
 ['profile.getPicture', z => z.profile.getPicture('a@example.test'), {url:'https://images.example.test/photo.jpg',base64:'AAEC'}],
 ['contacts.isOnWhatsApp true', z => z.contacts.isOnWhatsApp('a@example.test'), {isOnWhatsApp:true}],
 ['contacts.isOnWhatsApp false', z => z.contacts.isOnWhatsApp('a@example.test'), {isOnWhatsApp:false}],
 ['contacts.isOnWhatsApp omitted', z => z.contacts.isOnWhatsApp('a@example.test'), {}],
 ['groups.list populated', z => z.groups.list(), [{id:'group-1@g.us',subject:'Synthetic group',participants:[]}]],
 ['groups.list empty', z => z.groups.list(), []],
 ['groups.create direct', z => z.groups.create({subject:'Synthetic group'}), {id:'group-1@g.us',subject:'Synthetic group'}],
 ...['addParticipants','removeParticipants','promoteParticipants','demoteParticipants'].map(method => [`groups.${method}`, z => z.groups[method]('group-1@g.us',['a@example.test']), participantResults]),
 ['messages.sendText omitted message', z => z.messages.sendText({number:'123',message:'hello'}), {status:'success'}],
 ['messages.sendText null message', z => z.messages.sendText({number:'123',message:'hello'}), {status:'success',message:null}],
 ['messages.sendText raw message', z => z.messages.sendText({number:'123',message:'hello'}), {status:'success',message:{key:{id:'synthetic'},message:{conversation:'hello'}}}],
 ['messages.getMediaBase64 null metadata', z => z.messages.getMediaBase64('m-1'), {status:'success',data:{media:'AAEC',mimeType:null,fileName:null}}],
 ['messages.editText unknown DTO', z => z.messages.editText('m-1',{text:'edited'}), {status:'success',data:{id:'m-1',text:'edited',extra:{arbitrary:true}}}],
 ['privacy.get direct', z => z.privacy.get(), {last:'contacts',online:'all',readreceipts:'none'}],
]
for (const [name,invoke,fixture] of fixtures) {
 test(`${name} preserves its backend response shape`, async () => {
  let calls=0
  const zappaz=new Zappaz({baseUrl:'https://api.example.test',apiKey:'fake-key',sessionId:'session-1',fetch:async()=>{calls++;return Response.json(fixture)}})
  assert.deepEqual(await invoke(zappaz),fixture)
  assert.equal(calls,1)
 })
}

for (const status of [400, 404]) {
 test(`messages.get preserves scoped ${status} errors`, async () => {
  const zappaz = new Zappaz({baseUrl:'https://api.example.test',apiKey:'key',sessionId:'session-1',fetch:async()=>Response.json({error:{code:'SCOPED_ERROR',message:'Not available'}},{status})})
  await assert.rejects(zappaz.messages.get('wa',{lid:'123@lid'}), error => error.status === status && error.code === 'SCOPED_ERROR')
 })
}
