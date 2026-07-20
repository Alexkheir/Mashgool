import { cn } from '@/lib/utils';

// Placeholder top navigation. The links are intentionally non-functional for now
// (href="#") — real destinations get wired up later.
const NAV_LINKS = ['Overview', 'Pricing', 'Privacy and terms', 'FAQ'];

// Placeholder brand mark — a small cluster of dots, standing in for the real
// logo. Swap for the actual asset later.
function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-neutral-900" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="12" cy="5" r="2.4" />
        <circle cx="12" cy="19" r="2.4" />
        <circle cx="5" cy="12" r="2.4" />
        <circle cx="19" cy="12" r="2.4" />
      </g>
    </svg>
  );
}

export function SiteNavbar() {
  return (
    <header className="relative flex items-center justify-between px-6 py-6 sm:px-10">
      <a href="#" aria-label="Mashgool home" className="shrink-0">
        <LogoMark />
      </a>

      <nav
        className={cn(
          'absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1',
          'rounded-full bg-neutral-100 p-1.5 md:flex'
        )}
      >
        {NAV_LINKS.map((label) => (
          <a
            key={label}
            href="#"
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-white hover:text-neutral-950"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Spacer to balance the flex row against the logo. */}
      <div className="w-7 shrink-0" aria-hidden="true" />
    </header>
  );
}
