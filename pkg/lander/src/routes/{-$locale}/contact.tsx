import {
  contactNumberE164,
  formatContactNumber,
  JEDIDIAH_FACEBOOK_URL,
  JEDIDIAH_INSTAGRAM_URL,
  JEDIDIAH_LOCATION,
} from '@pkg/domain';
import {
  IconArrowRight,
  IconBrandFacebook,
  IconBrandInstagram,
  IconCheck,
  IconChevronDown,
  IconMail,
  IconMapPin,
  IconPhone,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { PageHero } from '../../components/page-hero.js';
import { SandWatermarkSection } from '../../components/sand-watermark-section.js';
import { captureEvent, captureEventForNavigation } from '../../lib/analytics.js';
import { seoHead } from '../../lib/seo.js';
import { messagesForLocale, useLocale, useMessages } from '../../messages/index.js';
import { getRangeOptions } from '../../server/catalog/ranges.js';

export const Route = createFileRoute('/{-$locale}/contact')({
  loader: async ({ context }) => ({ equipmentOptions: await getRangeOptions({ data: { locale: context.locale } }) }),
  head: ({ match }) => {
    const m = messagesForLocale(match.context.locale);

    return seoHead({
      title: m.contact.pageTitle,
      description: m.contact.metaDescription,
      locale: match.context.locale,
      path: '/contact',
    });
  },
  component: ContactPage,
});

const FIELD_CLASS =
  'w-full border-[1.5px] border-[#d9d7d1] bg-cream px-[15px] py-[13px] font-body text-[16px] text-ink outline-none focus:border-gold';
const LABEL_CLASS = 'mb-2 block font-display text-[13px] font-semibold uppercase tracking-[1.5px] text-[#888]';

type FormStatus = 'idle' | 'submitting' | 'sent' | 'error';

function ArrowIcon() {
  return <IconArrowRight className="text-ink" size={20} stroke={2.4} aria-hidden="true" />;
}

function Header() {
  const m = useMessages();

  return (
    <PageHero eyebrow={m.contact.heroEyebrow} title={m.contact.heroTitle} showBackgroundImage={false}>
      <p className="m-0">{m.contact.heroBody}</p>
    </PageHero>
  );
}

function SentState() {
  const m = useMessages();

  return (
    <div className="px-2.5 py-10 text-center">
      <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center bg-gold">
        <IconCheck className="text-ink" size={38} stroke={2.6} aria-hidden="true" />
      </div>
      <h2 className="m-0 mb-3 font-display text-[34px] font-extrabold uppercase tracking-[0.5px] text-ink">
        {m.contact.sentTitle}
      </h2>
      <p className="m-0 mx-auto max-w-[380px] font-body text-[17px] leading-[1.6] text-[#666]">{m.contact.sentBody}</p>
    </div>
  );
}

function EnquiryForm({ equipmentOptions }: { equipmentOptions: string[] }) {
  const m = useMessages();
  const locale = useLocale();
  const [status, setStatus] = useState<FormStatus>('idle');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus('submitting');

    try {
      const response = await fetch(`/api/contact?locale=${locale}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          phone: String(data.get('phone') ?? ''),
          equipment: String(data.get('equipment') ?? ''),
          message: String(data.get('message') ?? ''),
        }),
      });

      if (!response.ok) {
        setStatus('error');
        captureEvent('contact_submit_failed', { errorCategory: 'server' });
        return;
      }

      form.reset();
      setStatus('sent');
      captureEvent('contact_submitted', {
        equipment: String(data.get('equipment') ?? '') || m.contact.notSpecified,
      });
    } catch {
      setStatus('error');
      captureEvent('contact_submit_failed', { errorCategory: 'network' });
    }
  }

  if (status === 'sent') {
    return <SentState />;
  }

  return (
    <div>
      <h2 className="m-0 mb-7 font-display text-[34px] font-extrabold uppercase tracking-[0.5px] text-ink">
        {m.contact.formTitle}
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-5 grid grid-cols-2 gap-5 max-xs:grid-cols-1">
          <div>
            <label htmlFor="contact-name" className={LABEL_CLASS}>
              {m.contact.fullNameLabel}
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              required
              placeholder={m.contact.namePlaceholder}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className={LABEL_CLASS}>
              {m.contact.phoneLabel}
            </label>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              placeholder={m.contact.phonePlaceholder}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-5 max-xs:grid-cols-1">
          <div>
            <label htmlFor="contact-email" className={LABEL_CLASS}>
              {m.contact.emailLabel}
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              placeholder={m.contact.emailPlaceholder}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="contact-equipment" className={LABEL_CLASS}>
              {m.contact.equipmentLabel}
            </label>
            <div className="relative">
              <select
                id="contact-equipment"
                name="equipment"
                defaultValue=""
                className={`${FIELD_CLASS} appearance-none pr-11`}
              >
                <option value="">{m.contact.equipmentPlaceholder}</option>
                {equipmentOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
                <option>{m.contact.equipmentNotSure}</option>
              </select>
              <IconChevronDown
                className="pointer-events-none absolute top-1/2 right-[15px] -translate-y-1/2 text-[#888]"
                size={18}
                stroke={2}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        <div className="mb-7">
          <label htmlFor="contact-message" className={LABEL_CLASS}>
            {m.contact.messageLabel}
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            required
            placeholder={m.contact.messagePlaceholder}
            className={`${FIELD_CLASS} resize-y`}
          />
        </div>
        {status === 'error' ? (
          <p className="m-0 mb-5 font-body text-[15px] text-[#b3261e]">{m.contact.sendError}</p>
        ) : null}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="flex items-center gap-3.5 border-none bg-gold px-[34px] py-[17px] font-display text-[19px] font-bold uppercase tracking-[1.5px] text-ink transition-colors hover:bg-[#e6c200] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'submitting' ? m.contact.sending : m.contact.sendMessage} <ArrowIcon />
        </button>
      </form>
    </div>
  );
}

function PhoneIcon() {
  return <IconPhone className="flex-none text-yellow" size={24} aria-hidden="true" />;
}

function MailIcon() {
  return <IconMail className="flex-none text-yellow" size={24} aria-hidden="true" />;
}

function InstagramIcon() {
  return <IconBrandInstagram className="flex-none text-yellow" size={24} aria-hidden="true" />;
}

function FacebookIcon() {
  return <IconBrandFacebook className="flex-none text-yellow" size={24} aria-hidden="true" />;
}

function PinIcon({ className }: { className?: string }) {
  return <IconMapPin className={`text-yellow ${className ?? ''}`} size={24} aria-hidden="true" />;
}

function ContactMethodLabel({ label }: { label: string }) {
  return (
    <span className="mb-[3px] block font-display text-[12px] font-semibold uppercase tracking-[1.5px] text-[#8a8a8a]">
      {label}
    </span>
  );
}

function ContactInfo() {
  const m = useMessages();

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-ink px-[34px] py-9">
        <h3 className="m-0 mb-6 font-display text-[22px] font-bold uppercase tracking-[1px] text-white">
          {m.contact.directHeading}
        </h3>
        <div className="flex flex-col gap-[22px]">
          <a
            href={`tel:${contactNumberE164()}`}
            onClick={() => captureEventForNavigation('phone_link_clicked', { placement: 'contact_page' })}
            className="flex items-start gap-4 no-underline"
          >
            <PhoneIcon />
            <span>
              <ContactMethodLabel label={m.contact.phoneLabel} />
              <span className="font-body text-[17px] text-white">{formatContactNumber()}</span>
            </span>
          </a>
          <a href={`mailto:${m.contact.emailAddress}`} className="flex items-start gap-4 no-underline">
            <MailIcon />
            <span>
              <ContactMethodLabel label={m.contact.emailLabel} />
              <span className="font-body text-[17px] text-white">{m.contact.emailAddress}</span>
            </span>
          </a>
          <a
            href={JEDIDIAH_FACEBOOK_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-4 no-underline"
          >
            <FacebookIcon />
            <span>
              <ContactMethodLabel label={m.contact.facebookLabel} />
              <span className="font-body text-[17px] text-white">{m.contact.facebookHandle}</span>
            </span>
          </a>
          <a
            href={JEDIDIAH_INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              captureEventForNavigation('social_link_clicked', {
                platform: 'instagram',
                placement: 'contact_page',
              })
            }
            className="flex items-start gap-4 no-underline"
          >
            <InstagramIcon />
            <span>
              <ContactMethodLabel label={m.contact.instagramLabel} />
              <span className="font-body text-[17px] text-white">{m.contact.instagramHandle}</span>
            </span>
          </a>
          <div className="flex items-start gap-4">
            <PinIcon />
            <span>
              <ContactMethodLabel label={m.contact.locationLabel} />
              <span className="font-body text-[17px] leading-[1.4] text-white">{JEDIDIAH_LOCATION}</span>
            </span>
          </div>
        </div>
        <a
          href={`https://wa.me/${contactNumberE164().slice(1)}`}
          onClick={() =>
            captureEventForNavigation('social_link_clicked', {
              platform: 'whatsapp',
              placement: 'contact_page',
            })
          }
          className="mt-7 flex items-center justify-center gap-3 bg-yellow px-4 py-[15px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
        >
          {m.contact.whatsapp}
        </a>
      </div>

      <div className="border border-line bg-white px-[34px] py-[30px]">
        <h3 className="m-0 mb-[18px] font-display text-[20px] font-bold uppercase tracking-[1px] text-ink">
          {m.contact.officeHoursHeading}
        </h3>
        <div className="flex flex-col gap-[11px]">
          {m.contact.officeHours.map((row) => (
            <div key={row.day} className="flex justify-between font-body text-[15.5px]">
              <span className="text-[#666]">{row.day}</span>
              <span className="font-semibold text-ink">{row.hours}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MapStrip() {
  const m = useMessages();

  return (
    <section className="relative h-[340px] overflow-hidden bg-[#cfcdc6]">
      <img
        src="/hero-silage-harvest.jpg"
        alt=""
        aria-hidden="true"
        className="h-full w-full scale-[1.01] object-cover brightness-[0.7] grayscale-[0.6] blur-[1.5px]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-ink px-9 py-[26px] text-center">
          <PinIcon className="mx-auto mb-2.5" />
          <div className="font-display text-[22px] font-bold uppercase tracking-[1px] text-white">
            {JEDIDIAH_LOCATION}
          </div>
          <div className="mt-1 font-body text-[14px] text-[#bdbdbd]">{m.contact.visitByAppointment}</div>
        </div>
      </div>
    </section>
  );
}

function ContactPage() {
  const { equipmentOptions } = Route.useLoaderData();

  return (
    <main className="bg-sand">
      <Header />
      <SandWatermarkSection variant="contact" className="pt-18 pb-22 max-nav:py-11">
        <div className="mx-auto grid max-w-[1320px] grid-cols-[1.25fr_1fr] items-start gap-14 px-12 max-nav:grid-cols-1 max-nav:gap-7 max-nav:px-5">
          <div className="border border-line bg-white px-11 pt-11 pb-12 shadow-[0_1px_3px_rgba(0,0,0,0.06)] max-nav:px-[22px] max-nav:pt-7 max-nav:pb-8">
            <EnquiryForm equipmentOptions={equipmentOptions} />
          </div>
          <ContactInfo />
        </div>
      </SandWatermarkSection>
      <MapStrip />
    </main>
  );
}
