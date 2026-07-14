import { contactNumberE164, formatContactNumber, JEDIDIAH_LOCATION } from '@pkg/domain';
import logoUrl from '@pkg/domain/assets/brand/jedidiah-logo.png';
import { IconMapPin, IconMenu2, IconPhone, IconSwitchHorizontal, IconX } from '@tabler/icons-react';
import { Link, useMatch, useMatchRoute, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { CANONICAL_LOCALE } from '../lib/locale.js';
import { localePreferenceHref } from '../lib/locale-preference.js';
import { useLocale, useMessages } from '../messages/index.js';

// Match Home by its index route id: matching the optional-locale path itself also matches its parent layout
// on every localized page. Section links stay lit on their child pages (fuzzy).
const LINKS = [
  { key: 'home', to: '/{-$locale}', fuzzy: false },
  { key: 'about', to: '/{-$locale}/about', fuzzy: true },
  { key: 'products', to: '/{-$locale}/products', fuzzy: true },
  { key: 'contact', to: '/{-$locale}/contact', fuzzy: true },
] as const;

function PhoneIcon() {
  return <IconPhone className="text-yellow" size={17} aria-hidden="true" />;
}

function PinIcon() {
  return <IconMapPin className="text-yellow" size={16} aria-hidden="true" />;
}

function Logo({ onNavigate }: { onNavigate: () => void }) {
  const m = useMessages();

  return (
    <Link to="/{-$locale}" onClick={onNavigate} className="flex flex-none items-center no-underline">
      <img src={logoUrl} alt={m.site.logoAlt} className="h-11 w-auto max-header:h-9" />
    </Link>
  );
}

function LanguageToggle({ className = '', currentHref }: { className?: string; currentHref: string }) {
  const m = useMessages();
  const locale = useLocale();
  const targetLocale = locale === CANONICAL_LOCALE ? 'af' : CANONICAL_LOCALE;
  const label = m.language.switchTo(m.language.names[targetLocale]);

  return (
    <a
      href={localePreferenceHref(currentHref, targetLocale)}
      className={`${className} group flex h-11 flex-none items-center gap-2 whitespace-nowrap font-body font-semibold text-[#e8e8e8] no-underline transition-colors hover:text-white`}
    >
      <IconSwitchHorizontal
        className="text-yellow transition-colors group-hover:text-white"
        size={17}
        stroke={2.2}
        aria-hidden="true"
      />
      <span>{label}</span>
    </a>
  );
}

export function Nav() {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const homeMatch = useMatch({ from: '/{-$locale}/', shouldThrow: false });
  const matchRoute = useMatchRoute();
  const currentHref = useRouterState({ select: (state) => state.location.href });
  const isLinkActive = (link: (typeof LINKS)[number]) =>
    link.key === 'home' ? Boolean(homeMatch) : Boolean(matchRoute({ to: link.to, fuzzy: link.fuzzy }));

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-ink">
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between gap-6 px-12 max-header:h-16 max-header:px-5">
        <Logo onNavigate={() => setOpen(false)} />

        <nav className="flex flex-none items-center gap-10 max-header:hidden">
          {LINKS.map((link) => {
            const active = isLinkActive(link);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative py-1.5 font-display text-[18px] font-semibold uppercase tracking-[1px] no-underline transition-colors ${
                  active ? 'text-yellow' : 'text-[#cfcfcf] hover:text-white'
                }`}
              >
                {m.nav[link.key]}
                {active ? <span className="absolute right-0 -bottom-0.5 left-0 h-[3px] bg-yellow" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-none items-center gap-7 max-header:hidden">
          <LanguageToggle currentHref={currentHref} className="text-[14px]" />
          <a href={`tel:${contactNumberE164()}`} className="flex items-center gap-[9px] no-underline">
            <PhoneIcon />
            <span className="font-body text-[15px] font-semibold text-[#e8e8e8]">{formatContactNumber()}</span>
          </a>
          <span className="flex items-center gap-[9px]">
            <PinIcon />
            <span className="font-body text-[15px] font-semibold text-[#e8e8e8]">{JEDIDIAH_LOCATION}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={m.nav.menuLabel}
          aria-expanded={open}
          className="hidden h-[46px] w-[46px] flex-none items-center justify-center border-[1.5px] border-[#3a3a3a] bg-transparent max-header:flex"
        >
          {open ? (
            <IconX className="text-yellow" size={22} stroke={2.2} aria-hidden="true" />
          ) : (
            <IconMenu2 className="text-yellow" size={24} stroke={2.2} aria-hidden="true" />
          )}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[#2a2a2a] bg-[#1b1b1b] header:hidden">
          <nav className="flex flex-col px-5 pt-2 pb-[18px]">
            {LINKS.map((link) => {
              const active = isLinkActive(link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={`border-b border-[#2a2a2a] py-[15px] font-display text-[20px] font-semibold uppercase tracking-[1px] no-underline ${
                    active ? 'text-yellow' : 'text-[#cfcfcf]'
                  }`}
                >
                  {m.nav[link.key]}
                </Link>
              );
            })}
            <LanguageToggle currentHref={currentHref} className="mt-4 self-center text-[16px]" />
            <div className="flex flex-col gap-[14px] pt-[18px]">
              <a href={`tel:${contactNumberE164()}`} className="flex items-center gap-[11px] no-underline">
                <PhoneIcon />
                <span className="font-body text-[16px] font-semibold text-[#e8e8e8]">{formatContactNumber()}</span>
              </a>
              <span className="flex items-center gap-[11px]">
                <PinIcon />
                <span className="font-body text-[16px] font-semibold text-[#e8e8e8]">{JEDIDIAH_LOCATION}</span>
              </span>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
