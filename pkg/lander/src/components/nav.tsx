import { useRouterState } from '@tanstack/react-router';
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
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
        stroke="#fff000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#fff000" strokeWidth="2" />
      <circle cx="12" cy="10" r="3" stroke="#fff000" strokeWidth="2" />
    </svg>
  );
}

function Logo() {
  return (
    <a href="/" className="flex flex-none items-center gap-3 no-underline">
      <span className="flex flex-col gap-[5px]">
        <span className="h-[6px] w-[34px] -skew-x-[20deg] bg-yellow" />
        <span className="h-[6px] w-[22px] -skew-x-[20deg] bg-yellow" />
      </span>
      <span className="flex flex-col leading-[0.86]">
        <span className="font-display text-[30px] font-extrabold italic tracking-[0.5px] text-white max-nav:text-[24px]">
          JEDIDIAH
        </span>
        <span className="text-right font-display text-[13px] font-semibold tracking-[7px] text-[#9a9a9a] max-nav:text-[11px] max-nav:tracking-[5px]">
          EQUIPMENT
        </span>
      </span>
    </a>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-ink">
      <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between gap-6 px-12 max-nav:h-16 max-nav:px-5">
        <Logo />

        <nav className="flex flex-none items-center gap-10 max-nav:hidden">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <a
                key={link.href}
                href={link.href}
                className={`relative py-1.5 font-display text-[18px] font-semibold uppercase tracking-[1px] no-underline transition-colors ${
                  active ? 'text-yellow' : 'text-[#cfcfcf] hover:text-white'
                }`}
              >
                {link.label}
                {active ? <span className="absolute right-0 -bottom-0.5 left-0 h-[3px] bg-yellow" /> : null}
              </a>
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" stroke="#fff000" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="#fff000" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[#2a2a2a] bg-[#1b1b1b] nav:hidden">
          <nav className="flex flex-col px-5 pt-2 pb-[18px]">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`border-b border-[#2a2a2a] py-[15px] font-display text-[20px] font-semibold uppercase tracking-[1px] no-underline ${
                    active ? 'text-yellow' : 'text-[#cfcfcf]'
                  }`}
                >
                  {link.label}
                </a>
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
