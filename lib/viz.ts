import type { NormalizedEvent } from '@/server/schema/event';
import type { Alert } from '@/server/detection/types';
export function trafficSeries(events:readonly NormalizedEvent[],time:number){const values=Array.from({length:60},(_,i)=>({ts:time-300000+i*5000,bytes:0,packets:0}));for(const e of events){const i=Math.floor((Date.parse(e.ts)-(time-300000))/5000);if(i>=0&&i<60){values[i].bytes+=e.bytes_out+e.bytes_in;values[i].packets+=e.packets;}}return values;}
export function attackCounts(alerts:readonly Alert[]){const counts:Record<string,number>={};for(const a of alerts)counts[a.type]=(counts[a.type]??0)+1;return Object.entries(counts).sort((a,b)=>b[1]-a[1]);}
export function shortNumber(value:number){return value>=1e9?`${(value/1e9).toFixed(1)}G`:value>=1e6?`${(value/1e6).toFixed(1)}M`:value>=1000?`${(value/1000).toFixed(1)}K`:String(Math.round(value));}
