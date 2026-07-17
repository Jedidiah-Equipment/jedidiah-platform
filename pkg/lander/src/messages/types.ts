import type { Locale } from '../lib/locale.js';

type FeatureMessage = { title: string; body: string };
type ValueMessage = { num: string; title: string; body: string };
type MilestoneMessage = { year: string; text: string };
type OfficeHoursMessage = { day: string; hours: string };

export type Messages = {
  site: {
    title: string;
    description: string;
    ogSiteName: string;
    ogTitle: string;
    ogDescription: string;
    logoAlt: string;
  };
  nav: {
    home: string;
    products: string;
    about: string;
    contact: string;
    menuLabel: string;
  };
  language: {
    names: Record<Locale, string>;
    switchTo: (language: string) => string;
  };
  footer: {
    description: string;
    exploreHeading: string;
    rangesHeading: string;
    contactHeading: string;
    facebookHandle: string;
    instagramHandle: string;
    contactUs: string;
    copyright: string;
    tagline: string;
  };
  featureBar: {
    southAfricanBuilt: FeatureMessage;
    heavyDutyEquipment: FeatureMessage;
    equipmentRange: FeatureMessage;
  };
  productCard: {
    viewDetails: string;
  };
  variantFilter: {
    allChip: string;
    filterByVariant: string;
    moreChip: (count: number) => string;
  };
  home: {
    heroImageAlt: string;
    heroEyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    contactUs: string;
    viewEquipmentRange: string;
    rangesEyebrow: string;
    rangesTitle: string;
    viewAllProducts: string;
    ctaTitle: string;
    ctaBody: string;
  };
  about: {
    pageTitle: string;
    metaDescription: string;
    heroEyebrow: string;
    heroTitle: string;
    heroBody: string;
    storyEyebrow: string;
    storyTitle: string;
    storyParagraphs: string[];
    teamImageAlt: string;
    stats: Array<{ value: string; label: string }>;
    equipmentRangesLabel: string;
    valuesEyebrow: string;
    valuesTitle: string;
    values: ValueMessage[];
    timelineTitle: string;
    milestones: MilestoneMessage[];
    ctaTitle: string;
    ctaBody: string;
    contactUs: string;
  };
  products: {
    pageTitle: string;
    metaDescription: string;
    heroEyebrow: string;
    heroTitle: string;
    heroBody: string;
    filterByRange: string;
    allChip: string;
    modelCount: (count: number) => string;
  };
  productDetail: {
    notFoundPageTitle: string;
    notFoundMetaDescription: string;
    fallbackDescription: (name: string, rangeName: string) => string;
    pageTitle: (name: string, rangeName: string) => string;
    breadcrumbHome: string;
    breadcrumbProducts: string;
    openFullSizeImage: (name: string) => string;
    viewImage: (number: number) => string;
    fullSizeImage: (name: string) => string;
    closeImageDialog: string;
    contactUs: string;
    callUs: string;
    shareProduct: string;
    shareTitle: (name: string) => string;
    shareText: (name: string) => string;
    linkCopied: string;
    shareFailed: string;
    downloads: string;
    productBrochure: string;
    keyFeatures: string;
    standardAssemblies: string;
    optionalAssemblies: string;
    relatedHeading: (rangeName: string) => string;
    notFoundEyebrow: string;
    notFoundTitle: string;
    notFoundBody: string;
    viewAllProducts: string;
  };
  contact: {
    pageTitle: string;
    metaDescription: string;
    heroEyebrow: string;
    heroTitle: string;
    heroBody: string;
    sentTitle: string;
    sentBody: string;
    formTitle: string;
    fullNameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    equipmentLabel: string;
    equipmentPlaceholder: string;
    equipmentNotSure: string;
    messageLabel: string;
    messagePlaceholder: string;
    sendError: string;
    sending: string;
    sendMessage: string;
    notSpecified: string;
    directHeading: string;
    facebookLabel: string;
    instagramLabel: string;
    locationLabel: string;
    facebookHandle: string;
    instagramHandle: string;
    emailAddress: string;
    whatsapp: string;
    officeHoursHeading: string;
    officeHours: OfficeHoursMessage[];
    visitByAppointment: string;
    validation: {
      enterName: string;
      enterMessage: string;
      expectedJson: string;
      checkForm: string;
      unavailable: string;
      sendFailed: string;
    };
  };
};
