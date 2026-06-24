import logoUrl from '@pkg/domain/assets/brand/jedidiah-logo.png';
import { IconMapPin, IconMenu2, IconPhone, IconX } from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Products', href: '/products' },
  { label: 'Contact Us', href: '/contact' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function PhoneIcon() {
  return <IconPhone className="text-yellow" size={17} aria-hidden="true" />;
}

function PinIcon() {
  return <IconMapPin className="text-yellow" size={16} aria-hidden="true" />;
}

function Logo({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex flex-none items-center no-underline">
      <img src={logoUrl} alt="Jedidiah Equipment" className="h-11 w-auto max-nav:h-9" />
    </Link>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-ink">
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between gap-6 px-12 max-nav:h-16 max-nav:px-5">
        <Logo onNavigate={() => setOpen(false)} />

        <nav className="flex flex-none items-center gap-10 max-nav:hidden">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`relative py-1.5 font-display text-[18px] font-semibold uppercase tracking-[1px] no-underline transition-colors ${
                  active ? 'text-yellow' : 'text-[#cfcfcf] hover:text-white'
                }`}
              >
                {link.label}
                {active ? <span className="absolute right-0 -bottom-0.5 left-0 h-[3px] bg-yellow" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-none items-center gap-7 max-nav:hidden">
          <a href="tel:+27128190131" className="flex items-center gap-[9px] no-underline">
            <PhoneIcon />
            <span className="font-body text-[15px] font-semibold text-[#e8e8e8]">+27 12 819 0131</span>
          </a>
          <span className="flex items-center gap-[9px]">
            <PinIcon />
            <span className="font-body text-[15px] font-semibold text-[#e8e8e8]">Bapsfontein, South Africa</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Menu"
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
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setOpen(false)}
                  className={`border-b border-[#2a2a2a] py-[15px] font-display text-[20px] font-semibold uppercase tracking-[1px] no-underline ${
                    active ? 'text-yellow' : 'text-[#cfcfcf]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="flex flex-col gap-[14px] pt-[18px]">
              <a href="tel:+27128190131" className="flex items-center gap-[11px] no-underline">
                <PhoneIcon />
                <span className="font-body text-[16px] font-semibold text-[#e8e8e8]">+27 12 819 0131</span>
              </a>
              <span className="flex items-center gap-[11px]">
                <PinIcon />
                <span className="font-body text-[16px] font-semibold text-[#e8e8e8]">Bapsfontein, South Africa</span>
              </span>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
