import { z } from 'zod';
import { getState } from '@/server/adapters/state';
import { getStore } from '@/server/adapters/store';
import { runDetection } from '@/server/detection';
import { correlate, entityRisk } from '@/server/correlation';
import { simulate } from './simulator';
import { summarize } from './stats';
import { ApiError } from '@/server/security/errors';
import { ipMaskingEnabled, maskIp } from '@/server/security/sanitize';
import type { NormalizedEvent } from '@/server/schema/event';
import type { Incident } from '@/server/detection/types';
const sourceSchema=z.enum(['simulation','ingested']);
export function sourceFrom(request:Request){const p=sourceSchema.safeParse(new URL(request.url).searchParams.get('source')??'simulation');if(!p.success)throw new ApiError(400,'bad_request','source must be simulation or ingested');return p.data;}
export function pipeline(events:readonly NormalizedEvent[],statuses:Record<string,Incident['status']>={}){const detection=runDetection(events);return {...detection,incidents:correlate(detection.alerts,statuses),risk:entityRisk(detection.alerts)};}
export function publicData<T>(value:T):T {if(!ipMaskingEnabled())return value;const walk=(v:unknown,key=''):unknown=>{if(typeof v==='string'){if(/^(?:src_ip|dst_ip|ip|blocklist_match)$/.test(key)||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)||v.includes(':')&&/^[a-f0-9:]+$/i.test(v))return maskIp(v);return v;}if(Array.isArray(v))return v.map(x=>walk(x,key));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,k)]));return v;};return walk(value) as T;}
export async function snapshot(source:'simulation'|'ingested',time=Date.now()){
const retained=getState().kind==='upstash'?await getState().getJson<NormalizedEvent[]>('events-window'):null;const events=source==='simulation'?simulate(42,time):retained??await getStore().recent(getStore().capacity);const statuses=await getState().getJson<Record<string,Incident['status']>>('incident-statuses')??{};const result=pipeline(events,statuses);return publicData({...result,events:events.slice(-200),event_count:events.length,stats:summarize(events,false),source,simulation:source==='simulation',time:new Date(time).toISOString(),scope:source==='simulation'?'deterministic':getState().kind==='upstash'?'shared-window':'instance',warning:'probabilistic_detection'});
}
export async function ingestPipeline(events:NormalizedEvent[]){const state=getState();const retained=await state.appendEvents('events-window',events,2000);const end=Math.max(...retained.map(e=>Date.parse(e.ts)),0);const window=retained.filter(e=>Date.parse(e.ts)>end-300000);const result=pipeline(window);await state.setJson('latest-alerts',result.alerts,3600);await state.setJson('latest-incidents',result.incidents,3600);return result;}
