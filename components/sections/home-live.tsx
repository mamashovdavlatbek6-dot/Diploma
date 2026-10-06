'use client';
import dynamic from 'next/dynamic';
import type { Messages } from '@/lib/i18n/messages';
import { useLive,type Snapshot } from '@/lib/use-live';
import { Counter } from '@/components/ui/counter';
import { Chip } from '@/components/ui/primitives';
const WorldMap=dynamic(()=>import('@/components/viz/world-map').then(m=>m.WorldMap),{loading:()=> <div className="skeleton map-skeleton"/>});
export function HomeLive({initial,m}:{initial:Snapshot;m:Messages}){const {data}=useLive(initial,'simulation');return <><div className="hero-visual"><div className="hero-map"><div className="map-label"><Chip>{m.product.simulation}</Chip><span>{m.product.live}</span></div><WorldMap data={data} label={m.product.map}/><div className="map-footer"><span>11 / {m.product.detectors}</span><span>{data.alerts.length} / {m.product.signals}</span><span>{m.product.explainable}</span></div></div><div className="visual-corner"><span>{m.product.protected}</span><strong>11<span>/</span><small>{m.product.detectors}</small></strong></div></div><div className="home-counters">{[[m.product.events,data.event_count],[m.product.signals,data.alerts.length],[m.product.incidents,data.incidents.length]].map(([label,value])=><div key={label}><strong><Counter value={Number(value)}/><span>↗</span></strong><span>{label}</span></div>)}<div className="counter-source"><Chip>{m.product.simulation}</Chip><span>{m.product.probabilistic}</span></div></div></>;}
