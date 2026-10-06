import { notFound } from 'next/navigation';
import { isLocale } from '@/config/i18n';
import { getMessages } from '@/lib/i18n/messages';
import { Home } from '@/components/sections/home';
export default async function HomePage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <Home m={getMessages(locale)} locale={locale}/>;}
