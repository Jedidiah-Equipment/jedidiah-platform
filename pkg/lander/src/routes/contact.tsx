import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { captureEvent } from '../lib/analytics.js';

export const Route = createFileRoute('/contact')({
  head: () => ({
    meta: [
      { title: 'Contact — Jedidiah Equipment' },
      {
        name: 'description',
        content:
          'Get in touch with Jedidiah Equipment. Call, email or WhatsApp us, or send an enquiry and our team will get back to you.',
      },
    ],
  }),
  component: ContactPage,
});

const EQUIPMENT_OPTIONS = ['Crosshaul (Trailers)', 'Recharge (Tanks)', 'Silage & Grain', 'Planting', 'Not sure yet'];

const FIELD_CLASS =
  'w-full border-[1.5px] border-[#d9d7d1] bg-cream px-[15px] py-[13px] font-body text-[16px] text-ink outline-none focus:border-gold';
const LABEL_CLASS = 'mb-2 block font-display text-[13px] font-semibold uppercase tracking-[1.5px] text-[#888]';

type FormStatus = 'idle' | 'submitting' | 'sent' | 'error';

function ArrowIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true">
      <path d="M1 7h19M14 1l6 6-6 6" stroke="#161616" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="#161616"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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

function EnquiryForm() {
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
            <select id="contact-equipment" name="equipment" defaultValue="" className={FIELD_CLASS}>
              <option value="">Select equipment (optional)</option>
              {EQUIPMENT_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
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
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-none" aria-hidden="true">
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

function MailIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-none" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="1.5" stroke="#fff000" strokeWidth="2" />
      <path d="M3 6l9 7 9-7" stroke="#fff000" strokeWidth="2" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#fff000" strokeWidth="2" />
      <circle cx="12" cy="10" r="3" stroke="#fff000" strokeWidth="2" />
    </svg>
  );
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
          <a href="tel:+27128190131" className="flex items-start gap-4 no-underline">
            <PhoneIcon />
            <span>
              <ContactMethodLabel label="Phone" />
              <span className="font-body text-[17px] text-white">+27 12 819 0131</span>
            </span>
          </a>
          <a href="mailto:info@jedidiahequipment.co.za" className="flex items-start gap-4 no-underline">
            <MailIcon />
            <span>
              <ContactMethodLabel label="Email" />
              <span className="font-body text-[17px] text-white">info@jedidiahequipment.co.za</span>
            </span>
          </a>
          <div className="flex items-start gap-4">
            <PinIcon />
            <span>
              <ContactMethodLabel label="Location" />
              <span className="font-body text-[17px] leading-[1.4] text-white">
                Bapsfontein, Gauteng,
                <br />
                South Africa
              </span>
            </span>
          </div>
        </div>
        <a
          href="https://wa.me/27128190131"
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
        src="/range-ripper.jpg"
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover brightness-[0.7] grayscale-[0.6]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-ink px-9 py-[26px] text-center">
          <PinIcon className="mx-auto mb-2.5" />
          <div className="font-display text-[22px] font-bold uppercase tracking-[1px] text-white">
            Bapsfontein, Gauteng
          </div>
          <div className="mt-1 font-body text-[14px] text-[#bdbdbd]">Visit by appointment</div>
        </div>
      </div>
    </section>
  );
}

function ContactPage() {
  return (
    <main className="bg-sand">
      <Header />
      <section className="mx-auto grid max-w-[1320px] grid-cols-[1.25fr_1fr] items-start gap-14 px-12 pt-18 pb-22 max-nav:grid-cols-1 max-nav:gap-7 max-nav:px-5 max-nav:py-11">
        <div className="border border-line bg-white px-11 pt-11 pb-12 shadow-[0_1px_3px_rgba(0,0,0,0.06)] max-nav:px-[22px] max-nav:pt-7 max-nav:pb-8">
          <EnquiryForm />
        </div>
        <ContactInfo />
      </section>
      <MapStrip />
    </main>
  );
}
