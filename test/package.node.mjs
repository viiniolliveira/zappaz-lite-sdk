import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('packed package resolves and runs as an ESM consumer in Node', async () => {
 const temp=await mkdtemp(join('/tmp/opencode','zappaz-package-test-'))
 try {
  execFileSync('bun',['pm','pack','--ignore-scripts','--filename',join(temp,'sdk.tgz'),'--quiet'],{cwd:root,stdio:'pipe'})
  const destination=join(temp,'node_modules','@zappaz','zappaz-lite-sdk')
  await mkdir(destination,{recursive:true})
  execFileSync('tar',['-xzf',join(temp,'sdk.tgz'),'-C',destination,'--strip-components=1'])
  const script=`import { Zappaz } from '@zappaz/zappaz-lite-sdk';
    let request;
    const zappaz=new Zappaz({baseUrl:'https://api.example.test',apiKey:'synthetic-key',sessionId:'synthetic-session',fetch:async (input,init)=>{request=new Request(input,init);return Response.json({status:'success'})}});
    const result=await zappaz.groups.list();
    if(result.status!=='success'||request.headers.get('x-api-key')!=='synthetic-key'||!request.url.endsWith('/group')) throw Error('unexpected package behavior');`
  const output=execFileSync(process.execPath,['--input-type=module','--eval',script],{cwd:temp,encoding:'utf8'})
  assert.equal(output,'')
 } finally { await rm(temp,{recursive:true,force:true}) }
})
