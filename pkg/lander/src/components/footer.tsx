const EXPLORE = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Products', href: '/products' },
  { label: 'Contact Us', href: '/contact' },
];

const RANGES = ['Crosshaul', 'Recharge', 'Silage & Grain', 'Planting'];

function FooterLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="font-body text-[15px] text-[#a8a8a8] no-underline transition-colors hover:text-yellow">
      {label}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink-soft text-white">
      <div className="mx-auto max-w-[1320px] px-12 pt-[72px] max-nav:px-5 max-nav:pt-12">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-14 border-b border-[#2a2a2a] pb-14 max-nav:grid-cols-2 max-nav:gap-y-9 max-nav:gap-x-7 max-xs:grid-cols-1">
          <div>
            <div className="mb-[22px] flex items-center gap-3">
              <span className="flex flex-col gap-[5px]">
                <span className="h-[6px] w-[30px] -skew-x-[20deg] bg-yellow" />
                <span className="h-[6px] w-[19px] -skew-x-[20deg] bg-yellow" />
              </span>
              <span className="flex flex-col leading-[0.86]">
                <span className="font-display text-[26px] font-extrabold italic tracking-[0.5px] text-white">
                  JEDIDIAH
                </span>
                <span className="text-right font-display text-[11px] font-semibold tracking-[6px] text-[#8a8a8a]">
                  EQUIPMENT
                </span>
              </span>
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
              {RANGES.map((label) => (
                <FooterLink key={label} label={label} href="/products" />
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-[22px] font-display text-[17px] font-bold uppercase tracking-[1.5px] text-white">
              Get in touch
            </h4>
            <div className="flex flex-col gap-[15px]">
              <a href="tel:+27128190131" className="flex items-center gap-[11px] no-underline">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
                    stroke="#fff000"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="font-body text-[15px] text-[#cfcfcf]">+27 12 819 0131</span>
              </a>
              <span className="flex items-start gap-[11px]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="mt-0.5" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="#fff000" strokeWidth="2" />
                  <circle cx="12" cy="10" r="3" stroke="#fff000" strokeWidth="2" />
                </svg>
                <span className="font-body text-[15px] leading-[1.5] text-[#cfcfcf]">
                  Bapsfontein,
                  <br />
                  Gauteng, South Africa
                </span>
              </span>
              <a
                href="/contact"
                className="mt-1.5 self-start bg-yellow px-[22px] py-[11px] font-display text-[15px] font-bold uppercase tracking-[1px] text-ink no-underline"
              >
                Contact Us
              </a>
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
