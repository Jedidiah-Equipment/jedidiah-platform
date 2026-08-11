import {
  contactNumberE164,
  formatContactNumber,
  JEDIDIAH_FACEBOOK_URL,
  JEDIDIAH_INSTAGRAM_URL,
  JEDIDIAH_LOCATION,
} from '@pkg/domain';
import { IconBrandFacebook, IconBrandInstagram, IconMapPin, IconPhone } from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { FOOTER_LOGO } from '../assets/images.js';
import { captureEvent, captureEventForNavigation, isInternalUser, setInternalUser } from '../lib/analytics.js';
import { LOCALES } from '../lib/locale.js';
import { localePreferenceHref } from '../lib/locale-preference.js';
import { useLocale, useMessages } from '../messages/index.js';
import type { FooterRange } from '../server/catalog/ranges.js';

import { DungBeetle } from './dung-beetle.js';

const EXPLORE = [
  { key: 'home', to: '/{-$locale}' },
  { key: 'about', to: '/{-$locale}/about' },
  { key: 'products', to: '/{-$locale}/products' },
  { key: 'contact', to: '/{-$locale}/contact' },
] as const;

const footerLinkClass = 'font-body text-[15px] text-[#a8a8a8] no-underline transition-colors hover:text-yellow';
const INTERNAL_TOGGLE_CLICKS = 6;
const INTERNAL_TOGGLE_WINDOW_MS = 2000;

function FooterLink({ label, to }: { label: string; to: (typeof EXPLORE)[number]['to'] }) {
  return (
    <Link to={to} className={footerLinkClass}>
      {label}
    </Link>
  );
}

export function Footer({ ranges }: { ranges: FooterRange[] }) {
  const m = useMessages();
  const locale = useLocale();
  const [switchingLanguage, setSwitchingLanguage] = useState(false);
  const [internalUser, setInternalUserState] = useState(false);
  const beetleClickTimes = useRef<number[]>([]);
  const currentHref = useRouterState({ select: (state) => state.location.href });
  const targetLocale = LOCALES.find((other) => other !== locale) ?? locale;
  const targetLanguage = m.language.names[targetLocale];

  useEffect(() => {
    // A language switch can be restored from the back-forward cache with React state intact.
    const resetLanguageSwitch = () => setSwitchingLanguage(false);
    window.addEventListener('pageshow', resetLanguageSwitch);
    return () => window.removeEventListener('pageshow', resetLanguageSwitch);
  }, []);

  useEffect(() => setInternalUserState(isInternalUser()), []);

  function handleBeetleClick() {
    const now = performance.now();
    beetleClickTimes.current = [
      ...beetleClickTimes.current.filter((click) => now - click < INTERNAL_TOGGLE_WINDOW_MS),
      now,
    ];

    if (beetleClickTimes.current.length < INTERNAL_TOGGLE_CLICKS) {
      return;
    }

    beetleClickTimes.current = [];
    setInternalUserState(setInternalUser(!internalUser));
  }

  function handleLanguageSwitch(event: MouseEvent<HTMLAnchorElement>) {
    const staysInCurrentPage =
      event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (staysInCurrentPage) {
      setSwitchingLanguage(true);
    }

    captureEventForNavigation('language_switched', {
      fromLocale: locale,
      toLocale: targetLocale,
      placement: 'footer',
    });
  }

  return (
    <footer className="bg-ink-soft text-white">
      <div className="mx-auto max-w-[1320px] px-12 pt-[72px] max-nav:px-5 max-nav:pt-12">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-14 pb-14 max-nav:grid-cols-2 max-nav:gap-y-9 max-nav:gap-x-7 max-xs:grid-cols-1">
          <div>
            <div className="mb-[22px]">
              <img
                src={FOOTER_LOGO.src}
                width={FOOTER_LOGO.width}
                height={FOOTER_LOGO.height}
                loading="lazy"
                alt={m.site.logoAlt}
                className="h-10 w-auto"
              />
            </div>
            <p className="m-0 max-w-[330px] font-body text-[15px] leading-[1.7] text-[#9a9a9a]">
              {m.footer.description}
            </p>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              {m.footer.exploreHeading}
            </h4>
            <div className="flex flex-col gap-[13px]">
              {EXPLORE.map((link) => (
                <FooterLink key={link.to} to={link.to} label={m.nav[link.key]} />
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              {m.footer.rangesHeading}
            </h4>
            <div className="flex flex-col gap-[13px]">
              {ranges.map((range) => (
                <Link
                  key={range.slug}
                  to="/{-$locale}/products"
                  search={{ range: range.slug }}
                  className={footerLinkClass}
                >
                  {range.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              {m.footer.contactHeading}
            </h4>
            <div className="flex flex-col gap-[15px]">
              <a
                href={`tel:${contactNumberE164()}`}
                onClick={() => captureEventForNavigation('phone_link_clicked', { placement: 'footer' })}
                className="flex items-center gap-[11px] no-underline"
              >
                <IconPhone className="flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] text-[#cfcfcf]">{formatContactNumber()}</span>
              </a>
              <span className="flex items-start gap-[11px]">
                <IconMapPin className="mt-0.5 flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] leading-[1.5] text-[#cfcfcf]">{JEDIDIAH_LOCATION}</span>
              </span>
              <a
                href={JEDIDIAH_FACEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  captureEventForNavigation('social_link_clicked', { platform: 'facebook', placement: 'footer' })
                }
                className="flex items-center gap-[11px] no-underline"
              >
                <IconBrandFacebook className="flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] text-[#cfcfcf]">{m.footer.facebookHandle}</span>
              </a>
              <a
                href={JEDIDIAH_INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  captureEventForNavigation('social_link_clicked', { platform: 'instagram', placement: 'footer' })
                }
                className="flex items-center gap-[11px] no-underline"
              >
                <IconBrandInstagram className="flex-none text-yellow" size={17} aria-hidden="true" />
                <span className="font-body text-[15px] text-[#cfcfcf]">{m.footer.instagramHandle}</span>
              </a>
              <Link
                to="/{-$locale}/contact"
                onClick={() => captureEvent('cta_clicked', { cta: 'footer_contact', placement: 'footer' })}
                className="mt-1.5 self-start bg-yellow px-[22px] py-[11px] font-display text-[15px] font-bold uppercase tracking-[1px] text-ink no-underline"
              >
                {m.footer.contactUs}
              </Link>
            </div>
          </div>
        </div>

        <DungBeetle onClick={handleBeetleClick} />

        <div className="flex flex-wrap items-center justify-between gap-3 py-[26px] max-nav:flex-col max-nav:items-start max-nav:gap-2.5">
          <span className="font-body text-[13px] text-[#8a8a8a]">{m.footer.copyright}</span>
          {internalUser ? (
            <span className="font-body text-[13px] text-yellow">{m.footer.internalAnalyticsDisabled}</span>
          ) : null}
          <span className="font-display text-[13px] font-semibold uppercase tracking-[2px] text-[#8a8a8a]">
            {m.footer.tagline}
          </span>
          <a
            href={localePreferenceHref(currentHref, targetLocale)}
            aria-label={m.language.switchTo(targetLanguage)}
            aria-busy={switchingLanguage}
            onClick={handleLanguageSwitch}
            className={`font-body text-[13px] text-[#8a8a8a] underline decoration-[#5a5a5a] underline-offset-4 hover:text-yellow ${
              switchingLanguage ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {targetLanguage}
          </a>
        </div>
      </div>
    </footer>
  );
}
