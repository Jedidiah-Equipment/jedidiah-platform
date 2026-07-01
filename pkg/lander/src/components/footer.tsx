import { contactNumberE164, formatContactNumber, JEDIDIAH_INSTAGRAM_URL, JEDIDIAH_LOCATION } from '@pkg/domain';
import logoFullUrl from '@pkg/domain/assets/brand/jedidiah-logo-full.png';
import { IconBrandInstagram, IconMapPin, IconPhone } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import type { FooterRange } from '../server/catalog/ranges.js';

const EXPLORE = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Products', href: '/products' },
  { label: 'Contact Us', href: '/contact' },
] as const;

const footerLinkClass = 'font-body text-[15px] text-[#a8a8a8] no-underline transition-colors hover:text-yellow';

function FooterLink({ label, href }: { label: string; href: (typeof EXPLORE)[number]['href'] }) {
  return (
    <Link to={href} className={footerLinkClass}>
      {label}
    </Link>
  );
}

export function Footer({ ranges }: { ranges: FooterRange[] }) {
  return (
    <footer className="bg-ink-soft text-white">
      <div className="mx-auto max-w-[1320px] px-12 pt-[72px] max-nav:px-5 max-nav:pt-12">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-14 border-b border-[#2a2a2a] pb-14 max-nav:grid-cols-2 max-nav:gap-y-9 max-nav:gap-x-7 max-xs:grid-cols-1">
          <div>
            <div className="mb-[22px]">
              <img src={logoFullUrl} alt="Jedidiah Equipment" className="h-10 w-auto" />
            </div>
            <p className="m-0 max-w-[330px] font-body text-[15px] leading-[1.7] text-[#9a9a9a]">
              Heavy-duty agricultural equipment, proudly designed and manufactured in South Africa to perform in local
              conditions.
            </p>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              Explore
            </h4>
            <div className="flex flex-col gap-[13px]">
              {EXPLORE.map((link) => (
                <FooterLink key={link.href} {...link} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              Ranges
            </h4>
            <div className="flex flex-col gap-[13px]">
              {ranges.map((range) => (
                <Link key={range.slug} to="/products" search={{ range: range.slug }} className={footerLinkClass}>
                  {range.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              Get in touch
            </h4>
            <div className="flex flex-col gap-[15px]">
              <a href={`tel:${contactNumberE164()}`} className="flex items-center gap-[11px] no-underline">
                <IconPhone className="flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] text-[#cfcfcf]">{formatContactNumber()}</span>
              </a>
              <span className="flex items-start gap-[11px]">
                <IconMapPin className="mt-0.5 flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] leading-[1.5] text-[#cfcfcf]">{JEDIDIAH_LOCATION}</span>
              </span>
              <a
                href={JEDIDIAH_INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-[11px] no-underline"
              >
                <IconBrandInstagram className="flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] text-[#cfcfcf]">@jedidiahequipment</span>
              </a>
              <Link
                to="/contact"
                className="mt-1.5 self-start bg-yellow px-[22px] py-[11px] font-display text-[15px] font-bold uppercase tracking-[1px] text-ink no-underline"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 py-[26px] max-nav:flex-col max-nav:items-start max-nav:gap-2.5">
          <span className="font-body text-[13px] text-[#6a6a6a]">© 2026 Jedidiah Equipment. All rights reserved.</span>
          <span className="font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#6a6a6a]">
            South African Built · Farmer Proven
          </span>
        </div>
      </div>
    </footer>
  );
}
