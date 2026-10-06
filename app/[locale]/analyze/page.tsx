import { pageMetadata } from '@/lib/page-metadata';
export const generateMetadata=({params}:{params:Promise<{locale:string}>})=>pageMetadata(params,'analyze');
import { notFound } from 'next/navigation';import { isLocale } from '@/config/i18n';import { getMessages } from '@/lib/i18n/messages';
import { Analyzer } from '@/components/sections/analyzer';
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();const m=getMessages(locale);return <div className="container"><header className="page-head"><div><span className="eyebrow">AEGIS / LAB</span><h1>{m.nav.analyze}</h1><p>{m.analysis.subline}</p></div></header><Analyzer m={m}/></div>;}
