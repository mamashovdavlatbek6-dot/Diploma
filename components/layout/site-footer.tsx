import { siteConfig } from "@/config/site";
import type { Messages } from "@/lib/i18n/messages";

export function SiteFooter({ messages }: { messages: Messages }) {
  const { diploma } = siteConfig;
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 text-sm text-muted">
      <p>
        © {diploma.year} {siteConfig.name} · {messages.footer.rights}
        {diploma.university ? ` · ${diploma.university}` : ""}
      </p>
      <a href={siteConfig.repository} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
        {messages.footer.source}
      </a>
    </footer>
  );
}
