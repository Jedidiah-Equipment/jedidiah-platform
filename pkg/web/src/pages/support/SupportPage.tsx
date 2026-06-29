import type React from 'react';

import { AppBrand } from '@/components/common/AppBrand.js';

type SupportSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const supportEmail = 'info@jedidiahequipment.co.za';

const sections: SupportSection[] = [
  {
    title: 'About JedidiahOps',
    paragraphs: [
      'JedidiahOps is an internal business operations application for authorised Jedidiah Equipment staff. It is used to manage day-to-day work such as customers, quotes, jobs, products, and suppliers.',
      'Access is provided by Jedidiah Equipment. If you cannot sign in, need an account, or believe your access is incorrect, contact your system administrator first.',
    ],
  },
  {
    title: 'Getting support',
    paragraphs: ['For help with the application, email Jedidiah Equipment support using the contact details below.'],
    bullets: [
      'Describe what you were trying to do.',
      'Include the customer, quote, job, product, or supplier reference if the issue relates to a specific record.',
      'Include the device, browser, and approximate time the issue happened.',
      'Attach a screenshot if it helps explain the problem.',
    ],
  },
  {
    title: 'Common account help',
    paragraphs: [
      'If you forgot your password, use the password reset flow from the sign-in screen. If you did not receive a reset email, or your account has not been issued yet, contact your Jedidiah Equipment system administrator.',
      'For security reasons, access changes and account removals must be handled by an authorised administrator.',
    ],
  },
  {
    title: 'Contact',
    paragraphs: [
      `Email ${supportEmail} for application support. Support requests are handled by Jedidiah Equipment during normal business operations.`,
    ],
  },
];

export const SupportPage: React.FC = () => {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-4">
        <AppBrand />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Help and contact information for JedidiahOps users.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-3">
            <h2 className="text-xl font-medium tracking-tight">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="flex list-disc flex-col gap-2 pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="text-sm leading-relaxed text-muted-foreground">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <a
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={`mailto:${supportEmail}`}
        >
          {supportEmail}
        </a>
      </div>
    </main>
  );
};
