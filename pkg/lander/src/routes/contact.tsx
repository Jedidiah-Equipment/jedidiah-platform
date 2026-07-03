import { contactNumberE164, formatContactNumber, JEDIDIAH_INSTAGRAM_URL, JEDIDIAH_LOCATION } from '@pkg/domain';
import {
  IconArrowRight,
  IconBrandInstagram,
  IconCheck,
  IconChevronDown,
  IconMail,
  IconMapPin,
  IconPhone,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { SandWatermarkSection } from '../components/sand-watermark-section.js';
import { captureEvent } from '../lib/analytics.js';
import { seoHead } from '../lib/seo.js';
import { getRangeOptions } from '../server/catalog/ranges.js';

export const Route = createFileRoute('/contact')({
  head: () =>
    seoHead({
      title: 'Contact — Jedidiah Equipment',
      description:
        'Get in touch with Jedidiah Equipment. Call, email or WhatsApp us, or send an enquiry and our team will get back to you.',
      path: '/contact',
    }),
  loader: async () => ({ equipmentOptions: await getRangeOptions() }),
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
  return (
    <section className="bg-ink">
      <div className="mx-auto max-w-[1320px] px-12 pt-16 pb-14 max-nav:px-5 max-nav:pt-12 max-nav:pb-11">
        <div className="mb-4 flex items-center gap-3.5">
          <span className="h-1 w-[42px] bg-yellow" />
          <span className="font-display text-[15px] font-semibold uppercase tracking-[3px] text-yellow">
            Get in touch
          </span>
        </div>
        <h1 className="m-0 mb-3.5 font-display text-[68px] font-extrabold uppercase leading-[0.95] tracking-[0.5px] text-white max-nav:text-[44px]">
          Contact Us
        </h1>
        <p className="m-0 max-w-[560px] font-body text-[19px] leading-[1.55] text-[#bdbdbd]">
          Have a question or want to talk equipment? Send us a message and we'll get back to you.
        </p>
      </div>
    </section>
  );
}

function SentState() {
  return (
    <div className="px-2.5 py-10 text-center">
      <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center bg-gold">
        <IconCheck className="text-ink" size={38} stroke={2.6} aria-hidden="true" />
      </div>
      <h2 className="m-0 mb-3 font-display text-[34px] font-extrabold uppercase tracking-[0.5px] text-ink">
        Thank You
      </h2>
      <p className="m-0 mx-auto max-w-[380px] font-body text-[17px] leading-[1.6] text-[#666]">
        Your request has been received. A member of our team will be in touch shortly.
      </p>
    </div>
  );
}

function EnquiryForm({ equipmentOptions }: { equipmentOptions: string[] }) {
  const [status, setStatus] = useState<FormStatus>('idle');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus('submitting');

    try {
      const response = await fetch('/api/contact', {
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
        return;
      }

      form.reset();
      setStatus('sent');
      captureEvent('contact_submitted', { equipment: String(data.get('equipment') ?? '') || 'Not specified' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return <SentState />;
  }

  return (
    <div>
      <h2 className="m-0 mb-7 font-display text-[34px] font-extrabold uppercase tracking-[0.5px] text-ink">
        Send Us a Message
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-5 grid grid-cols-2 gap-5 max-xs:grid-cols-1">
          <div>
            <label htmlFor="contact-name" className={LABEL_CLASS}>
              Full Name
            </label>
            <input id="contact-name" name="name" type="text" required placeholder="Your name" className={FIELD_CLASS} />
          </div>
          <div>
            <label htmlFor="contact-phone" className={LABEL_CLASS}>
              Phone
            </label>
            <input id="contact-phone" name="phone" type="tel" placeholder="+27 ..." className={FIELD_CLASS} />
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-5 max-xs:grid-cols-1">
          <div>
            <label htmlFor="contact-email" className={LABEL_CLASS}>
              Email
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              placeholder="you@email.com"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="contact-equipment" className={LABEL_CLASS}>
              Equipment of Interest
            </label>
            <div className="relative">
              <select
                id="contact-equipment"
                name="equipment"
                defaultValue=""
                className={`${FIELD_CLASS} appearance-none pr-11`}
              >
                <option value="">Select equipment (optional)</option>
                {equipmentOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
                <option>Not sure yet</option>
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
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            required
            placeholder="Tell us about your operation and what you're looking for..."
            className={`${FIELD_CLASS} resize-y`}
          />
        </div>
        {status === 'error' ? (
          <p className="m-0 mb-5 font-body text-[15px] text-[#b3261e]">
            Something went wrong sending your message. Please try again, or email us at info@jedidiahequipment.co.za.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="flex items-center gap-3.5 border-none bg-gold px-[34px] py-[17px] font-display text-[19px] font-bold uppercase tracking-[1.5px] text-ink transition-colors hover:bg-[#e6c200] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'submitting' ? 'Sending…' : 'Send Message'} <ArrowIcon />
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
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-ink px-[34px] py-9">
        <h3 className="m-0 mb-6 font-display text-[22px] font-bold uppercase tracking-[1px] text-white">
          Reach Us Directly
        </h3>
        <div className="flex flex-col gap-[22px]">
          <a href={`tel:${contactNumberE164()}`} className="flex items-start gap-4 no-underline">
            <PhoneIcon />
            <span>
              <ContactMethodLabel label="Phone" />
              <span className="font-body text-[17px] text-white">{formatContactNumber()}</span>
            </span>
          </a>
          <a href="mailto:info@jedidiahequipment.co.za" className="flex items-start gap-4 no-underline">
            <MailIcon />
            <span>
              <ContactMethodLabel label="Email" />
              <span className="font-body text-[17px] text-white">info@jedidiahequipment.co.za</span>
            </span>
          </a>
          <a
            href={JEDIDIAH_INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-4 no-underline"
          >
            <InstagramIcon />
            <span>
              <ContactMethodLabel label="Instagram" />
              <span className="font-body text-[17px] text-white">@jedidiahequipment</span>
            </span>
          </a>
          <div className="flex items-start gap-4">
            <PinIcon />
            <span>
              <ContactMethodLabel label="Location" />
              <span className="font-body text-[17px] leading-[1.4] text-white">{JEDIDIAH_LOCATION}</span>
            </span>
          </div>
        </div>
        <a
          href={`https://wa.me/${contactNumberE164().slice(1)}`}
          className="mt-7 flex items-center justify-center gap-3 bg-yellow px-4 py-[15px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-ink no-underline transition-colors hover:bg-gold"
        >
          Chat on WhatsApp
        </a>
      </div>

      <div className="border border-line bg-white px-[34px] py-[30px]">
        <h3 className="m-0 mb-[18px] font-display text-[20px] font-bold uppercase tracking-[1px] text-ink">
          Office Hours
        </h3>
        <div className="flex flex-col gap-[11px]">
          {[
            { day: 'Mon – Fri', hours: '07:30 – 17:00' },
            { day: 'Saturday', hours: '08:00 – 12:00' },
            { day: 'Sunday', hours: 'Closed' },
          ].map((row) => (
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
          <div className="mt-1 font-body text-[14px] text-[#bdbdbd]">Visit by appointment</div>
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
