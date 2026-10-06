import { alert, groups } from './common';import snapshot from '@/content/threat-intel.json';import type { Detector } from './types';
const ips=new Set(snapshot.ips.map(i=>i.ip_address));
export const threatIntel:Detector = events => groups(events.filter(e=>ips.has(e.src_ip)||ips.has(e.dst_ip??'')),e=>ips.has(e.src_ip)?e.src_ip:e.dst_ip!).map(g=>alert('threat_intel',g,'high',[{field:'blocklist_match',value:ips.has(g[0].src_ip)?g[0].src_ip:g[0].dst_ip!},{field:'snapshot_date',value:snapshot.retrieved},{field:'feed',value:snapshot.name}],.8));
