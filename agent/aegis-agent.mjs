#!/usr/bin/env node
/** Dependency-free log tailer. Starts at EOF unless AGENT_FROM_START=true. */
import { open,stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const endpoint=process.env.AEGIS_URL;
const token=process.env.INGEST_TOKEN;
const paths=(process.env.AGENT_FILES??'/var/log/auth.log,/var/log/nginx/access.log').split(',').filter(Boolean);
if(!endpoint||!/^https?:\/\//.test(endpoint)||!token||token.length<16){console.error('Set AEGIS_URL and INGEST_TOKEN (at least 16 characters).');process.exit(1);}
const base=new URL(endpoint);if(base.protocol==='http:'&&!['localhost','127.0.0.1','::1'].includes(base.hostname)){console.error('Use HTTPS for remote ingestion.');process.exit(1);}
const states=new Map(paths.map(path=>[path,{offset:0,inode:null,rest:'',decoder:new TextDecoder()}]));
let running=true;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{running=false;});
let queue=[],queuedBytes=0,retry=1000;
const maxQueue=4*1024*1024;
async function tail(path,s){
 try{
  const info=await stat(path);
  if(s.inode===null){s.inode=info.ino;s.offset=process.env.AGENT_FROM_START==='true'?0:info.size;}
  if(s.inode!==info.ino||info.size<s.offset){s.offset=0;s.inode=info.ino;s.rest='';s.decoder=new TextDecoder();}
  if(info.size===s.offset||queuedBytes>=maxQueue)return;
  const file=await open(path,'r');try{
   const size=Math.min(128*1024,info.size-s.offset,maxQueue-queuedBytes);const buffer=new Uint8Array(size);
   const {bytesRead}=await file.read(buffer,0,size,s.offset);s.offset+=bytesRead;
   const text=s.rest+s.decoder.decode(buffer.subarray(0,bytesRead),{stream:true});const lines=text.split('\n');s.rest=lines.pop()??'';
   if(s.rest.length>16384){console.error('Oversized log line skipped');s.rest='';}
   for(const line of lines){if(!line.trim()||line.length>16384)continue;queue.push({line,path});queuedBytes+=Buffer.byteLength(line)+1;}
  }finally{await file.close();}
 }catch(error){console.error(`Cannot tail ${path}: ${error.code??'read failed'}`);}
}
async function send(){
 if(!queue.length)return;
 let length=0;const selected=[],indices=new Set();const path=queue[0].path;
 for(let i=0;i<queue.length;i++){if(queue[i].path!==path)continue;const bytes=Buffer.byteLength(queue[i].line)+1;if(selected.length>=500||length+bytes>=512*1024)break;length+=bytes;selected.push(queue[i].line);indices.add(i);}
 const discard=()=>{queue=queue.filter((_,i)=>!indices.has(i));queuedBytes-=length;};
 const batch=selected.join('\n')+'\n';
 try{
  const response=await fetch(new URL('/api/ingest',base),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'text/plain','x-aegis-source':'agent'},body:batch,signal:AbortSignal.timeout(10000)});
  if(!response.ok){if([400,413,415,422].includes(response.status)){discard();console.error(`Rejected batch (${response.status}); discarded`);return;}throw Error(`HTTP ${response.status}`);}
  const result=await response.json();discard();retry=1000;console.log(`Accepted ${result.accepted}; alerts ${result.alerts.length}; retained queue ${queue.length}`);
 }catch(error){console.error(`Retry in ${retry} ms: ${error.message}`);await delay(retry);retry=Math.min(retry*2,30000);}
}
while(running){for(const [path,state]of states)await tail(path,state);await send();await delay(1000);}
await send();
