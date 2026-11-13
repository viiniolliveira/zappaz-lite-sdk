import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as sdkModule from '../dist/index.js'

const { Zappaz, ZappazError, ZappazNetworkError } = sdkModule
const baseUrl = 'https://api.example.test/prefix/'
const sessionId = 'session /@'
const apiKey = 'synthetic-key'
const opts = { baseUrl, sessionId, apiKey }
const segment = encodeURIComponent
const id = 'id /@?'
const group = 'group /@?'
const w = 'hook /@?'
const l = 'log /@?'
const prefix = `/prefix/api/v1/session/${segment(sessionId)}/`
const number = '123@s.whatsapp.net'
const participants = ['one@lid', 'two@s.whatsapp.net']
const cases = [
 ['messages.list','GET','messages',[{phoneNumber:'5511999999999',lid:'123@lid',jid:'123@s.whatsapp.net',conversationId:'conversation',limit:25,before:'cursor /+'}],undefined,{phoneNumber:'5511999999999',lid:'123@lid',jid:'123@s.whatsapp.net',conversationId:'conversation',limit:'25',before:'cursor /+'}],
 ['messages.get','GET',`messages/${segment(id)}`,[id,{jid:'123@lid'}],undefined,{jid:'123@lid'}],
 ['messages.sendText','POST','message/text',[{number,message:'hello',linkPreview:false}],{number,message:'hello',linkPreview:false}],
 ['messages.sendImage','POST','message/image',[{number,source:'image',caption:'hi'}],{number,source:'image',caption:'hi'}],
 ['messages.sendVideo','POST','message/video',[{number,source:'video',gifPlayback:false}],{number,source:'video',gifPlayback:false}],
 ['messages.sendAudio','POST','message/audio',[{number,source:'audio',asVoiceNote:true}],{number,source:'audio',asVoiceNote:true}],
 ['messages.sendDocument','POST','message/document',[{number,source:'doc',fileName:'a.txt'}],{number,source:'doc',fileName:'a.txt'}],
 ['messages.sendContact','POST','message/contact',[{number,contact:{firstName:'A',lastName:'B',phoneNumber:'123'}}],{number,contact:{firstName:'A',lastName:'B',phoneNumber:'123'}}],
 ['messages.sendLocation','POST','message/location',[{number,location:{degreesLatitude:0,degreesLongitude:0}}],{number,location:{degreesLatitude:0,degreesLongitude:0}}],
 ['messages.editText','PATCH',`message/${segment(id)}`,[id,{text:'edited'}],{text:'edited'}],
 ['messages.deleteForEveryone','DELETE',`message/${segment(id)}`,[id]],
 ['messages.getMediaBase64','GET',`message/${segment(id)}/media/base64`,[id]],
 ['messages.getMediaBinary','GET',`message/${segment(id)}/media/binary`,[id]],
 ['groups.list','GET','group',[]],
 ['groups.create','POST','group',[{subject:'Group',participants}],{subject:'Group',participants}],
 ['groups.update','PUT',`group/${segment(group)}`,[group,{subject:'New',onlyAdminsCanPost:false}],{subject:'New',onlyAdminsCanPost:false}],
 ['groups.sendInvite','POST',`group/${segment(group)}/send-invite`,[group,{number,message:'invite'}],{number,message:'invite'}],
 ...['add','remove','promote','demote'].map(action => [`groups.${action}Participants`,'POST',`group/${segment(group)}/${action}`,[group,participants],participants]),
 ['groups.getInviteCode','POST',`group/${segment(group)}/invite-code`,[group]],
 ['groups.revokeInviteCode','POST',`group/${segment(group)}/invite-code-revoke`,[group]],
 ['groups.leave','POST',`group/${segment(group)}/leave`,[group]],
 ['profile.getPicture','GET','display-picture',[id],undefined,{identifier:id}],
 ['profile.updatePicture','PUT','display-picture',[{identifier:id,source:'data'}],{identifier:id,source:'data'}],
 ['profile.updateName','PUT','update-profile-name',[{name:'Name'}],{name:'Name'}],
 ['profile.updateStatus','PUT','update-profile-status',[{status:'Here'}],{status:'Here'}],
 ...[['isOnWhatsApp','is-on-whatsapp','GET'],['getAbout','get-about','GET'],['block','block-contact','PUT'],['unblock','unblock-contact','PUT']].map(([method,path,verb]) => [`contacts.${method}`,verb,`${path}/${segment(id)}`,[id]]),
 ['privacy.get','GET','privacy',[]],
 ...[['setLastSeen','last-seen','contacts'],['setOnline','online','match_last_seen'],['setProfilePicture','profile-picture','none'],['setStatus','status','all'],['setReadReceipts','read-receipts','none'],['setGroupsAdd','groups-add','contact_blacklist']].map(([method,path,value]) => [`privacy.${method}`,'PUT',`privacy/${path}`,[value],{privacy:value}]),
 ['privacy.setDisappearingMode','PUT','privacy/default-disappearing-mode',['OFF'],{mode:'OFF'}],
 ['webhooks.list','GET','webhook',[{page:'2',pageSize:'10'}],undefined,{page:'2',pageSize:'10'}],
 ['webhooks.create','POST','webhook',[{url:'https://example.test/hook',events:{call:true},secret:'fake-secret'}],{url:'https://example.test/hook',events:{call:true},secret:'fake-secret'}],
 ['webhooks.get','GET',`webhook/${segment(w)}`,[w]],
 ['webhooks.update','PUT',`webhook/${segment(w)}`,[w,{secret:null,enabled:false}],{secret:null,enabled:false}],
 ['webhooks.delete','DELETE',`webhook/${segment(w)}`,[w]],
 ['webhooks.listLogs','GET',`webhook/${segment(w)}/logs`,[w,{page:'2',pageSize:'10',event:'call',status:'500',startDate:'2026-01-01',endDate:'2026-01-02'}],undefined,{page:'2',pageSize:'10',event:'call',status:'500',startDate:'2026-01-01',endDate:'2026-01-02'}],
 ['webhooks.getLog','GET',`webhook/${segment(w)}/logs/${segment(l)}`,[w,l]],
 ['webhooks.retryLog','POST',`webhook/${segment(w)}/logs/${segment(l)}/retry`,[w,l]],
]
function invoke(sdk, name, args) { const [resource, method] = name.split('.'); return sdk[resource][method](...args) }

test('catalogue covers 48 routes', () => assert.equal(cases.length, 48))
for (const [name, method, path, args, body, query] of cases) {
 test(`${name}: request and success`, async () => {
  const result = {status:'success', data:[{id:'synthetic'}], marker:name}
  let request, redirect
  const sdk = new Zappaz({...opts, fetch: async (input, init) => { redirect = init.redirect; request = new Request(input, init); return name === 'messages.getMediaBinary' ? new Response(new Uint8Array([0, 255])) : Response.json(result) }})
  const actual = await invoke(sdk,name,args)
  if (name === 'messages.getMediaBinary') assert.deepEqual([...new Uint8Array(actual.data)], [0,255]); else assert.deepEqual(actual,result)
  const url = new URL(request.url)
  assert.equal(url.pathname,prefix+path)
  assert.deepEqual(Object.fromEntries(url.searchParams),query ?? {})
  assert.equal(request.method,method)
  assert.equal(request.headers.get('x-api-key'),apiKey)
  assert.equal(request.headers.get('authorization'),null)
  assert.equal(redirect,'error')
  if (body === undefined) { assert.equal(request.body,null); assert.equal(request.headers.get('content-type'),null) }
  else { assert.match(request.headers.get('content-type'),/^application\/json/); assert.deepEqual(await request.json(),body) }
 })
 test(`${name}: HTTP errors are propagated without retries`, async () => {
  let calls=0
  const sdk = new Zappaz({...opts,fetch:async () => { calls++; return Response.json({error:{code:'INVALID',message:'invalid',issues:[{path:'field'}]}},{status:400,headers:{'retry-after':'3'}}) }})
  await assert.rejects(invoke(sdk,name,args), error => { assert.ok(error instanceof ZappazError); assert.equal(error.status,400); assert.equal(error.code,'INVALID'); assert.deepEqual(error.issues,[{path:'field'}]); assert.equal(error.retryAfter,'3'); return true })
  assert.equal(calls,1)
 })
}

test('binary range and 416 metadata', async () => {
 let request
 const sdk = new Zappaz({...opts,fetch:async (input,init) => {request=new Request(input,init); return new Response(new Uint8Array([2,3]),{status:206,headers:{'content-type':'image/png','content-range':'bytes 2-3/8','content-length':'2','accept-ranges':'bytes'}})}})
 const result = await sdk.messages.getMediaBinary(id,{range:'bytes=2-3'})
 assert.equal(request.headers.get('range'),'bytes=2-3'); assert.equal(result.status,206)
 assert.deepEqual([...new Uint8Array(result.data)],[2,3])
 for (const [key,value] of Object.entries({'content-type':'image/png','content-range':'bytes 2-3/8','content-length':'2','accept-ranges':'bytes'})) assert.equal(result.headers.get(key),value)
 const failed = new Zappaz({...opts,fetch:async () => new Response(null,{status:416,headers:{'content-range':'bytes */8'}})})
 await assert.rejects(failed.messages.getMediaBinary(id,{range:'bytes=99-'}), e => e instanceof ZappazError && e.status===416 && e.headers.get('content-range')==='bytes */8')
})

test('invalid success JSON is a protocol error, not a network error', async () => {
 const sdk = new Zappaz({...opts,fetch:async () => new Response('{',{status:200,headers:{'x-trace':'trace'}})})
 await assert.rejects(sdk.groups.list(), e => { assert.equal(e.name,'ZappazProtocolError'); assert.ok(e instanceof sdkModule.ZappazProtocolError); assert.equal(e.status,200); assert.equal(e.headers.get('x-trace'),'trace'); assert.ok(e.cause); return true })
})

test('network failure, abort, timeout, and unsafe redirect do not retry', async () => {
 let calls=0
 const sdk = new Zappaz({...opts,fetch:async (_input,init) => {calls++; assert.equal(init.redirect,'error'); return new Promise((resolve,reject) => { if (init.signal.aborted) reject(init.signal.reason); else init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}) }) }})
 const controller = new AbortController(); controller.abort(new Error('cancelled'))
 await assert.rejects(sdk.groups.list({signal:controller.signal}),ZappazNetworkError)
 assert.equal(calls,0)
 await assert.rejects(sdk.groups.list({timeoutMs:5}),ZappazNetworkError)
 assert.equal(calls,1)
})

const secret = 'fake-webhook-secret'
const session = {id:sessionId,status:'open',jid:null}
const message = {id:'05b0a10a-cb46-4edf-b05d-60324044e985',messageId:'m1',conversationId:'a4cba58d-19b4-455c-85f1-118f65f334d7',chatId:'chat@g.us',remoteJid:null,lid:null,fromMe:false,isGroup:true,sender:{id:null},timestamp:null,type:'text',text:'hello'}
const envelope = (event='inbound-message.upsert',payload={message}) => ({event,payload,session})
function hook(body, headers={}) { return new Request('https://zappaz.example.test/hook',{method:'POST',headers:{'content-type':'application/json','x-zappaz-webhook-secret':secret,...headers},body:typeof body==='string'?body:JSON.stringify(body)}) }

test('webhook authenticates before reading; both configured mechanisms are required', async () => {
 let authCalls=0, dispatches=0, reads=0
 const sdk = new Zappaz({...opts,webhookSecret:secret,authenticateWebhook:async()=>{authCalls++; return true}})
 sdk.onEvent(()=>dispatches++)
 const stream = new ReadableStream({pull(controller){reads++; controller.enqueue(new TextEncoder().encode('{}'));controller.close()}})
 const request = new Request('https://zappaz.example.test',{method:'POST',headers:{'content-type':'application/json','x-zappaz-webhook-secret':'wrong'},body:stream,duplex:'half'})
 // Streams may prefetch one chunk independently; authentication must not lock or consume the body.
 assert.equal((await sdk.handleWebhook(request)).status,401); assert.equal(request.bodyUsed,false); assert.equal(authCalls,0); assert.equal(dispatches,0)
 const rejectAuth = new Zappaz({...opts,webhookSecret:secret,authenticateWebhook:async()=>false})
 assert.equal((await rejectAuth.handleWebhook(hook(envelope()))).status,401)
 const throwingAuth = new Zappaz({...opts,webhookSecret:secret,authenticateWebhook:async()=>{throw Error('private')}})
 assert.equal((await throwingAuth.handleWebhook(hook(envelope()))).status,401)
 assert.equal((await new Zappaz(opts).handleWebhook(hook(envelope()))).status,503)
})

test('array payloads from contact and group events are delivered unchanged', async () => {
 const sdk = new Zappaz({...opts,webhookSecret:secret})
 const seen=[]; sdk.onEvent(e=>seen.push(e))
 for (const event of ['contacts.upsert','contacts.update','groups.upsert','groups.update']) {
  const data=envelope(event,[{id:'synthetic@id'}]); assert.equal((await sdk.handleWebhook(hook(data))).status,204); assert.deepEqual(seen.at(-1),data)
 }
})

test('webhook stream limit counts bytes, accepts exact boundary and cancels oversized streams', async () => {
 const data=JSON.stringify(envelope('call',{value:'é'})); const bytes=new TextEncoder().encode(data)
 const sdk = new Zappaz({...opts,webhookSecret:secret,maxWebhookBytes:bytes.length})
 assert.equal((await sdk.handleWebhook(hook(data))).status,204)
 assert.equal((await sdk.handleWebhook(hook(data+' '))).status,413)
 let cancelled=false
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(bytes.length+1))},cancel(){cancelled=true}})
 const request=new Request('https://zappaz.example.test',{method:'POST',headers:{'content-type':'application/json','x-zappaz-webhook-secret':secret},body:stream,duplex:'half'})
 assert.equal((await sdk.handleWebhook(request)).status,413); assert.equal(cancelled,true)
 const invalid=new Request('https://zappaz.example.test',{method:'POST',headers:{'content-type':'application/json','x-zappaz-webhook-secret':secret},body:new Uint8Array([0xff])})
 assert.equal((await sdk.handleWebhook(invalid)).status,400)
})

test('webhook status codes and malformed messages', async () => {
 const sdk = new Zappaz({...opts,webhookSecret:secret}); let calls=0; sdk.onEvent(()=>calls++)
 assert.equal((await sdk.handleWebhook(new Request('https://zappaz.example.test'))).status,405)
 assert.equal((await sdk.handleWebhook(hook('{}',{'content-type':'text/plain'}))).status,415)
 assert.equal((await sdk.handleWebhook(hook('{'))).status,400)
 assert.equal((await sdk.handleWebhook(hook(envelope('not.real',{})))).status,422)
 assert.equal((await sdk.handleWebhook(hook({...envelope(),session:{...session,id:'other'}}))).status,403)
 for (const invalid of [null,{}, {...message,type:'not-real'}, {...message,fromMe:'false'}, {...message,sender:null}]) assert.equal((await sdk.handleWebhook(hook(envelope('inbound-message.upsert',{message:invalid})))).status,400)
 assert.equal(calls,0)
})

test('async webhook failures are observed once; errors from observer do not escape', async () => {
 const failure=new Error('handler secret detail'); const seen=[]
 const sdk=new Zappaz({...opts,webhookSecret:secret,onWebhookError:async error=>{seen.push(error); throw Error('observer failure')}})
 sdk.onMessage('text',async()=>{throw failure})
 const result=await sdk.handleWebhook(hook(envelope()))
 assert.equal(result.status,500); assert.deepEqual(seen,[failure]); assert.doesNotMatch(await result.text(),/secret detail|observer failure/)
})

test('webhook error observer sees async event handler failure', async () => {
 const failure=new Error('event failure'); const seen=[]
 const sdk=new Zappaz({...opts,webhookSecret:secret,onWebhookError:async error=>{seen.push(error)}})
 sdk.onEvent(async()=>{throw failure})
 assert.equal((await sdk.handleWebhook(hook(envelope('call',{})))).status,500); assert.deepEqual(seen,[failure])
})

test('configuration validates timeouts, session segments, and webhook secret', async () => {
 for (const timeoutMs of [0,-1,0.5,NaN,Infinity,2147483648]) assert.throws(()=>new Zappaz({...opts,timeoutMs}),undefined,`timeout ${timeoutMs}`)
 for (const sessionId of ['', '.', '..']) assert.throws(()=>new Zappaz({...opts,sessionId}),undefined,`session ${sessionId}`)
 for (const webhookSecret of ['', 'contains space', 'é', 'a\nb', 'x'.repeat(2049)]) assert.throws(()=>new Zappaz({...opts,webhookSecret}),undefined,`secret ${JSON.stringify(webhookSecret.slice(0,20))}`)
 for (const webhookSecret of ['!', '~'.repeat(2048)]) assert.doesNotThrow(()=>new Zappaz({...opts,webhookSecret}))
 for (const maxWebhookBytes of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>new Zappaz({...opts,maxWebhookBytes}))
})

test('constructor snapshots options rather than using later mutations', async () => {
 let request
 const config={...opts,webhookSecret:secret,fetch:async(input,init)=>{request=new Request(input,init);return Response.json({ok:true})}}
 const sdk=new Zappaz(config); config.apiKey='changed'; config.sessionId='changed'; config.webhookSecret='changed'
 await sdk.groups.list(); assert.equal(request.headers.get('x-api-key'),apiKey); assert.equal(new URL(request.url).pathname,prefix+'group')
 assert.equal((await sdk.handleWebhook(hook(envelope('call',{})))).status,204)
})

test('per-request invalid timeout is rejected before fetch', async () => {
 let calls=0; const sdk=new Zappaz({...opts,fetch:async()=>{calls++; return Response.json({})}})
 for (const timeoutMs of [0,-1,0.5,NaN,Infinity,2147483648]) await assert.rejects(sdk.groups.list({timeoutMs}))
 assert.equal(calls,0)
})

test('unsafe dot path segments are rejected before sending', async () => {
 let calls=0; const sdk=new Zappaz({...opts,fetch:async()=>{calls++;return Response.json({})}})
 for (const bad of ['.','..']) await assert.rejects(sdk.webhooks.get(bad))
 assert.equal(calls,0)
})

test('HTTP error redacts API key and preserves non-JSON error status', async () => {
 const leaking=new Zappaz({...opts,fetch:async()=>Response.json({error:{code:'DENIED',message:`bad ${apiKey}`}},{status:403})})
 await assert.rejects(leaking.groups.list(),e=>e instanceof ZappazError && e.status===403 && !String(e).includes(apiKey))
 const plain=new Zappaz({...opts,fetch:async()=>new Response('upstream failure',{status:502})})
 await assert.rejects(plain.groups.list(),e=>e instanceof ZappazError && e.status===502 && e.message==='HTTP 502')
})

test('native fetch does not send API key to a different redirect origin', async () => {
 const { createServer } = await import('node:http')
 const { once } = await import('node:events')
 let targetRequests=0, sourceKey
 const target=createServer((_req,res)=>{targetRequests++;res.end('{}')})
 const source=createServer((req,res)=>{sourceKey=req.headers['x-api-key'];res.writeHead(302,{location:`http://127.0.0.1:${target.address().port}/stolen`});res.end()})
 try {
  target.listen(0,'127.0.0.1'); await once(target,'listening')
  source.listen(0,'127.0.0.1'); await once(source,'listening')
  const zappaz = new Zappaz({...opts,baseUrl:`http://127.0.0.1:${source.address().port}`})
  await assert.rejects(zappaz.groups.list(),ZappazNetworkError)
  assert.equal(sourceKey,apiKey); assert.equal(targetRequests,0)
 } finally {
  source.closeAllConnections(); target.closeAllConnections()
  await Promise.all([new Promise(resolve=>source.close(resolve)),new Promise(resolve=>target.close(resolve))])
 }
})

test('non-message events preserve array payloads without assuming a payload schema', async () => {
 const zappaz = new Zappaz({...opts,webhookSecret:secret}); const seen=[]
 zappaz.onEvent(event=>seen.push(event))
 for (const event of ['chats.delete','chats.update','chats.upsert','labels.association','labels.edit','messages.delete','presence.update','call']) {
  const data=envelope(event,[{synthetic:'value'},null,4])
  assert.equal((await zappaz.handleWebhook(hook(data))).status,204,event)
  assert.deepEqual(seen.at(-1),data)
 }
})

test('malformed optional normalized fields rejected on inbound and outbound messages', async () => {
 const zappaz = new Zappaz({...opts,webhookSecret:secret}); let dispatched=0
 zappaz.onEvent(()=>dispatched++)
 const invalid=[
  {sender:{id:null,name:42}}, {status:'made-up'}, {status:17}, {media:'not-object'},
  {media:{mimeType:42}}, {media:{size:'large'}}, {media:{voice:'yes'}},
  {media:{thumbnail:{mimeType:'image/jpeg',base64:10,width:1,height:1}}},
  {mentions:'not-array'}, {mentions:['ok',7]},
 ]
 for (const event of ['inbound-message.upsert','outbound-message.upsert','messages.send']) {
  for (const override of invalid) {
   const response=await zappaz.handleWebhook(hook(envelope(event,{message:{...message,...override}})))
   assert.equal(response.status,400,`${event}: ${JSON.stringify(override)}`)
  }
 }
 assert.equal(dispatched,0)
})

test('well-formed optional normalized fields accepted for inbound and outbound events', async () => {
 const zappaz=new Zappaz({...opts,webhookSecret:secret}); const seen=[]
 zappaz.onEvent(event=>seen.push(event))
 const complete={...message,sender:{id:null,name:'Example'},status:'read',mentions:['member@lid'],media:{mimeType:'image/jpeg',size:10,voice:false,thumbnail:{mimeType:'image/jpeg',base64:'AA==',width:1,height:1}}}
 for (const event of ['inbound-message.upsert','outbound-message.upsert','messages.send']) {
  const data=envelope(event,{message:complete}); assert.equal((await zappaz.handleWebhook(hook(data))).status,204); assert.deepEqual(seen.at(-1),data)
 }
})

test('error response body stream failure preserves status and cause', async () => {
 const failure = new Error('response stream failed')
 const zappaz=new Zappaz({...opts,fetch:async()=>new Response(new ReadableStream({start(controller){controller.error(failure)}}),{status:503,headers:{'retry-after':'7'}})})
 await assert.rejects(zappaz.groups.list(),error=>{assert.ok(error instanceof ZappazError);assert.equal(error.status,503);assert.equal(error.retryAfter,'7');assert.equal(error.cause,failure);return true})
})

test('timeout while consuming success or error bodies keeps correct error class', async () => {
 for (const status of [200,503]) {
  const zappaz=new Zappaz({...opts,fetch:async(_input,init)=>new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(init.signal.reason),{once:true})}}),{status})})
  await assert.rejects(zappaz.groups.list({timeoutMs:10}),error=>{
   if(status===200) assert.ok(error instanceof ZappazNetworkError)
   else {assert.ok(error instanceof ZappazError);assert.equal(error.status,503)}
   assert.equal(error.cause?.name,'TimeoutError'); return true
  })
 }
})

test('non-syntax success-body failure is a network error, not a protocol error', async () => {
 const failure=new Error('body stream failure')
 const zappaz=new Zappaz({...opts,fetch:async()=>new Response(new ReadableStream({start(controller){controller.error(failure)}}))})
 await assert.rejects(zappaz.groups.list(),error=>error instanceof ZappazNetworkError && error.cause===failure)
})

test('webhook options snapshot includes authenticator and byte limit', async () => {
 let originalCalls=0, replacementCalls=0
 const payload=JSON.stringify(envelope('call',{}))
 const config={...opts,webhookSecret:secret,maxWebhookBytes:new TextEncoder().encode(payload).length,authenticateWebhook:()=>{originalCalls++;return true}}
 const zappaz=new Zappaz(config)
 config.maxWebhookBytes=1; config.authenticateWebhook=()=>{replacementCalls++;return false}; config.webhookSecret='changed'; config.sessionId='changed'
 assert.equal((await zappaz.handleWebhook(hook(payload))).status,204)
 assert.equal(originalCalls,1); assert.equal(replacementCalls,0)
})

test('oversized webhook still returns 413 if stream cancellation rejects', async () => {
 let cancelled=0, dispatched=0
 const zappaz=new Zappaz({...opts,webhookSecret:secret,maxWebhookBytes:4})
 zappaz.onEvent(()=>dispatched++)
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('12345'))},cancel(){cancelled++;return Promise.reject(new Error('cancel failed'))}})
 const request=new Request('https://zappaz.example.test',{method:'POST',headers:{'content-type':'application/json','x-zappaz-webhook-secret':secret},body,duplex:'half'})
 assert.equal((await zappaz.handleWebhook(request)).status,413)
 assert.equal(cancelled,1); assert.equal(dispatched,0)
})

test('API key redacted in error code, nested issue keys and values, and headers', async () => {
 const zappaz=new Zappaz({...opts,fetch:async()=>Response.json({error:{code:`BAD_${apiKey}`,message:`error ${apiKey}`,issues:[{[apiKey]:`value ${apiKey}`,nested:[apiKey]}]}},{status:400,headers:{'x-detail':`failure ${apiKey}`,'retry-after':`after-${apiKey}`}})})
 await assert.rejects(zappaz.groups.list(),error=>{
  assert.ok(error instanceof ZappazError); assert.equal(error.status,400)
  assert.equal(error.code,'BAD_[REDACTED]'); assert.equal(error.message,'error [REDACTED]')
  assert.deepEqual(error.issues,[{'[REDACTED]':'value [REDACTED]',nested:['[REDACTED]']}])
  assert.equal(error.headers.get('x-detail'),'failure [REDACTED]'); assert.equal(error.retryAfter,'after-[REDACTED]')
  return true
 })
})

test('inbound text may omit text and unknown type is dispatched to its handler', async () => {
 const zappaz=new Zappaz({...opts,webhookSecret:secret}); const seen=[]
 zappaz.onMessage('text',ctx=>seen.push(ctx.message))
 zappaz.onMessage('unknown',ctx=>seen.push(ctx.message))
 const {text: _removed, ...withoutText}=message
 for (const type of ['text','unknown']) {
  const value={...withoutText,type}
  assert.equal((await zappaz.handleWebhook(hook(envelope('inbound-message.upsert',{message:value})))).status,204)
  assert.deepEqual(seen.at(-1),value); assert.equal('text' in seen.at(-1),false)
 }
 assert.equal(seen.length,2)
})
