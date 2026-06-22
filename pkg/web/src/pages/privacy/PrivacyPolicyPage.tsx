import type React from 'react';

import { AppBrand } from '@/components/common/AppBrand.js';

type PrivacySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const lastUpdated = '22 June 2026';

const sections: PrivacySection[] = [
  {
    title: 'About this application',
    paragraphs: [
      'JedidiahOps is an internal business operations application used by authorised staff of Jedidiah Equipment to manage day-to-day work such as customers, quotes, jobs, products, and suppliers. It is not a consumer product and is not made available to the general public; access requires an account issued by Jedidiah Equipment.',
      'This policy explains what personal information the application stores, why it is stored, and how it is handled.',
    ],
  },
  {
    title: 'Information we collect',
    paragraphs: ['The application stores two broad categories of personal information.'],
    bullets: [
      'Staff account information — the name, email address, and (optionally) phone number of each authorised user, their assigned role and department, an encrypted password, email-verification status, and sign-in session records (including IP address and browser/device user-agent) used to keep accounts secure.',
      'Customer and business records — information staff enter to run the business, including customer company names, contact-person names, email addresses, phone numbers, postal addresses, VAT numbers, and free-text notes, together with the related quotes and jobs.',
    ],
  },
  {
    title: 'How we use this information',
    paragraphs: ['We use the information solely to operate the application for Jedidiah Equipment. Specifically, to:'],
    bullets: [
      'Authenticate users and keep accounts and sessions secure.',
      'Provide the application’s features — managing customers, quotes, jobs, products, and suppliers.',
      'Maintain an audit trail of changes for accountability and troubleshooting.',
    ],
  },
  {
    title: 'How information is shared',
    paragraphs: [
      'We do not sell personal information and we do not use it for advertising. Information is accessible only to authorised Jedidiah Equipment staff through their accounts.',
      'Information is processed by the third-party infrastructure providers that host the application and its database on Jedidiah Equipment’s behalf, and may be disclosed where required by law. It is not shared with any other third parties.',
    ],
  },
  {
    title: 'Data retention',
    paragraphs: [
      'Account and business records are retained for as long as they are needed to operate the business and while an account remains active. Sign-in sessions and verification records expire automatically. When information is no longer required — for example, when an account is removed — it is deleted from the active system.',
    ],
  },
  {
    title: 'Security',
    paragraphs: [
      'Access to the application requires authentication, passwords are stored using one-way encryption, and access to data is limited to authorised staff. Sessions expire automatically and can be revoked by an administrator.',
    ],
  },
  {
    title: 'Your rights',
    paragraphs: [
      'If you are a staff user or a customer whose details are held in the application, you may request access to, correction of, or deletion of your personal information. Requests are handled by Jedidiah Equipment using the contact details below.',
    ],
  },
  {
    title: 'Contact us',
    paragraphs: [
      'For any questions about this privacy policy or the personal information held in the application, please contact your Jedidiah Equipment system administrator.',
    ],
  },
];

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-4">
        <AppBrand />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
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
      </div>
    </main>
  );
};
