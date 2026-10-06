import type { NormalizedEvent } from '@/server/schema/event';
export const attackTypes = ['port_scan','brute_force','flood','dns_tunnel','beacon','exfiltration','lateral','web_attack','threat_intel','geo_anomaly','ml_anomaly'] as const;
export type AttackType = typeof attackTypes[number];
export type Severity = 'critical'|'high'|'medium'|'low'|'info';
export type Stage = 'recon'|'initial_access'|'c2'|'lateral'|'exfiltration'|'impact';
export interface Evidence { field: string; value: number|string; threshold?: number|string }
export interface Alert { id:string; type:AttackType; ts:string; source:string; simulation:boolean; severity:Severity; confidence:number; entities:string[]; evidence:Evidence[]; mitre:string; stage:Stage; recommended_action:string[]; contributions:{feature:string;value:number;weight:number}[]; event_refs:string[] }
export type Detector = (events: readonly NormalizedEvent[]) => Alert[];
export interface Incident { id:string; start:string; end:string; severity:Severity; confidence:number; risk:number; status:'open'|'acknowledged'|'resolved'|'false_positive'; entities:string[]; stages:Stage[]; alerts:Alert[]; simulation:boolean }
