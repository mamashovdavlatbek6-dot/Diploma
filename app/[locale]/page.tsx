import { isLocale } from "@/config/i18n";
import { getMessages } from "@/lib/i18n/messages";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const steps = [m.home.pipeline.ingest, m.home.pipeline.detect, m.home.pipeline.correlate, m.home.pipeline.respond];

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 pt-36 md:grid-cols-[1.3fr_1fr] md:pt-44">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{m.home.eyebrow}</p>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-gradient md:text-6xl">
          {m.home.title}
        </h1>
        <p className="mt-5 max-w-md text-lg text-muted">{m.home.subtitle}</p>
        <p className="mt-8 inline-flex items-center gap-2 rounded-full glass px-4 py-2 font-mono text-xs text-muted">
          <span className="size-2 rounded-full bg-primary shadow-glow" aria-hidden />
          {m.home.status}
        </p>
      </div>
      <ol className="glass grid content-start gap-3 rounded-[22px] p-6" aria-label={m.home.subtitle}>
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-4 rounded-xl border border-line px-4 py-3">
            <span className="font-mono text-sm tabular-nums text-secondary">0{i + 1}</span>
            <span className="font-display text-sm">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
