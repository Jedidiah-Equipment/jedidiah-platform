import { contactNumberE164, formatContactNumber, JEDIDIAH_LOCATION } from '@pkg/domain';
import logoUrl from '@pkg/domain/assets/brand/jedidiah-logo.png';
import { IconMapPin, IconMenu2, IconPhone, IconX } from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { LOCALES, type Locale, localePath, switchLocaleHref } from '../lib/locale.js';
import { persistLocalePreference } from '../lib/locale-preference.js';
import { useLocale, useMessages } from '../messages/index.js';
import { DropdownMenu } from './dropdown-menu.js';

const LINKS = [
  { key: 'home', href: '/' },
  { key: 'about', href: '/about' },
  { key: 'products', href: '/products' },
  { key: 'contact', href: '/contact' },
] as const;

function isActive(pathname: string, href: string): boolean {
  const isHome = href === '/' || href === '/af';
  return isHome ? pathname === href : pathname.startsWith(href);
}

function PhoneIcon() {
  return <IconPhone className="text-yellow" size={17} aria-hidden="true" />;
}

function PinIcon() {
  return <IconMapPin className="text-yellow" size={16} aria-hidden="true" />;
}

function Logo({ onNavigate }: { onNavigate: () => void }) {
  const m = useMessages();
  const locale = useLocale();

  return (
    <Link to={localePath('/', locale)} onClick={onNavigate} className="flex flex-none items-center no-underline">
      <img src={logoUrl} alt={m.site.logoAlt} className="h-11 w-auto max-nav:h-9" />
    </Link>
  );
}

function LanguageSelect({ className, onChange }: { className: string; onChange: (locale: Locale) => void }) {
  const m = useMessages();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const labels: Record<Locale, string> = {
    en: m.language.english,
    af: m.language.afrikaans,
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      label={<span>{labels[locale]}</span>}
      ariaLabel={m.language.label}
      triggerClassName={`${className} flex w-full items-center justify-between gap-3 transition-colors hover:border-[#777] hover:text-white`}
      panelClassName="min-w-full border border-[#4a4a4a] bg-[#1b1b1b] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
    >
      {LOCALES.map((optionLocale) => (
        <button
          key={optionLocale}
          type="button"
          role="menuitemradio"
          aria-checked={optionLocale === locale}
          onClick={() => {
            setOpen(false);
            if (optionLocale !== locale) {
              onChange(optionLocale);
            }
          }}
          className={`w-full px-3 py-2.5 text-left font-body text-[14px] font-semibold transition-colors ${
            optionLocale === locale ? 'bg-yellow text-ink' : 'text-[#e8e8e8] hover:bg-[#2a2a2a] hover:text-white'
          }`}
        >
          {labels[optionLocale]}
        </button>
      ))}
    </DropdownMenu>
  );
}

export function Nav() {
  const m = useMessages();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const location = useRouterState({ select: (state) => state.location });

  function switchLocale(target: Locale) {
    persistLocalePreference(target);
    window.location.assign(switchLocaleHref(location.href, target));
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-ink">
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between gap-6 px-12 max-nav:h-16 max-nav:px-5">
        <Logo onNavigate={() => setOpen(false)} />

        <nav className="flex flex-none items-center gap-10 max-nav:hidden">
          {LINKS.map((link) => {
            const href = localePath(link.href, locale);
            const active = isActive(location.pathname, href);
            return (
              <Link
                key={link.href}
                to={href}
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

        <div className="flex flex-none items-center gap-7 max-nav:hidden">
          <LanguageSelect
            onChange={switchLocale}
            className="min-w-[132px] border border-[#4a4a4a] bg-ink px-3 py-2 font-body text-[14px] font-semibold text-[#e8e8e8]"
          />
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
          className="hidden h-[46px] w-[46px] flex-none items-center justify-center border-[1.5px] border-[#3a3a3a] bg-transparent max-nav:flex"
        >
          {open ? (
            <IconX className="text-yellow" size={22} stroke={2.2} aria-hidden="true" />
          ) : (
            <IconMenu2 className="text-yellow" size={24} stroke={2.2} aria-hidden="true" />
          )}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[#2a2a2a] bg-[#1b1b1b] nav:hidden">
          <nav className="flex flex-col px-5 pt-2 pb-[18px]">
            {LINKS.map((link) => {
              const href = localePath(link.href, locale);
              const active = isActive(location.pathname, href);
              return (
                <Link
                  key={link.href}
                  to={href}
                  onClick={() => setOpen(false)}
                  className={`border-b border-[#2a2a2a] py-[15px] font-display text-[20px] font-semibold uppercase tracking-[1px] no-underline ${
                    active ? 'text-yellow' : 'text-[#cfcfcf]'
                  }`}
                >
                  {m.nav[link.key]}
                </Link>
              );
            })}
            <LanguageSelect
              onChange={switchLocale}
              className="mt-4 border border-[#4a4a4a] bg-[#1b1b1b] px-3 py-3 font-body text-[16px] font-semibold text-[#e8e8e8]"
            />
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
