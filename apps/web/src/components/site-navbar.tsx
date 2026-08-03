import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/ui/icons';

// Placeholder top navigation. The links are intentionally non-functional for now
// (href="#") — real destinations get wired up later.
const NAV_LINKS = ['Overview', 'Pricing', 'Privacy and terms', 'FAQ'];

export function SiteNavbar() {
  return (
    <header className="relative flex items-center justify-between px-6 py-6 sm:px-10">
      <a href="#" aria-label="Mashgool home" className="flex shrink-0 items-center gap-2.5">
        <LogoMark />
        <span className="text-sm font-semibold text-neutral-900">Mashgool</span>
      </a>

      <nav
        className={cn(
          'absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1',
          'rounded-full border border-neutral-200/70 bg-white/70 p-1.5 shadow-sm backdrop-blur md:flex'
        )}
      >
        {NAV_LINKS.map((label) => (
          <a
            key={label}
            href="#"
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Spacer to balance the flex row against the logo. */}
      <div className="w-9 shrink-0" aria-hidden="true" />
    </header>
  );
}
