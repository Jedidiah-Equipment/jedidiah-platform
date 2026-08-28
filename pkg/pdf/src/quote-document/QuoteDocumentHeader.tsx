import { formatDate, formatPhoneNumber, JEDIDIAH_BUSINESS_DETAILS } from '@pkg/domain';
import type { QuoteDocumentModel } from '@pkg/schema';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../pdf-fonts.js';
import { jedidiahLogoSrc } from '../pdf-logo.js';
import { pdfStyles } from './pdf-styles.js';

type QuoteDocumentHeaderProps = {
  document: QuoteDocumentModel;
};

const layout = {
  bankPanelWidth: 210,
  headerHeight: 122,
  logoHeight: 34,
  logoWidth: 132,
  panelPadding: 8,
} as const;

const styles = StyleSheet.create({
  header: {
    height: layout.headerHeight,
  },
  brandPanel: {
    padding: layout.panelPadding,
    position: 'relative',
  },
  brandStripe: {
    bottom: 0,
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  logoFrame: {
    flexShrink: 0,
    height: layout.logoHeight,
    marginBottom: 2,
    width: layout.logoWidth,
  },
  logo: {
    height: layout.logoHeight,
    objectFit: 'contain',
    width: layout.logoWidth,
  },
  tagline: {
    flexShrink: 0,
    fontFamily: pdfTitleFontFamily,
    fontSize: 10,
    marginBottom: 7,
  },
  brandLine: {
    flexShrink: 0,
    marginBottom: 2,
  },
  salesContactLine: {
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
  bankPanel: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 6,
    paddingHorizontal: layout.panelPadding,
    paddingTop: 4,
    width: layout.bankPanelWidth,
  },
  documentHeading: {
    alignItems: 'flex-end',
    lineHeight: 1,
  },
  documentDate: {
    lineHeight: 1,
    marginBottom: 0,
  },
  documentTitleText: {
    fontFamily: pdfTitleFontFamily,
    lineHeight: 1.1,
    marginBottom: 6,
  },
  quoteCode: {
    lineHeight: 1,
  },
  bankDetails: {
    alignItems: 'flex-end',
    lineHeight: 1,
  },
  bankTitle: {
    lineHeight: 1.2,
    marginBottom: 1,
  },
  bankLine: {
    lineHeight: 1.2,
  },
});

export function QuoteDocumentHeader({ document }: QuoteDocumentHeaderProps) {
  const contactLine = getSalesContactLine(document);

  return (
    <View style={[pdfStyles.flexRow, styles.header]}>
      <View style={[pdfStyles.bgBlack, pdfStyles.colorWhite, pdfStyles.flex1, styles.brandPanel]}>
        <View style={styles.logoFrame}>
          <Image src={jedidiahLogoSrc} style={styles.logo} />
        </View>
        <Text
          style={[
            pdfStyles.colorBrandYellow,
            pdfStyles.fontBold,
            pdfStyles.textBodyLg,
            pdfStyles.uppercase,
            styles.tagline,
          ]}
        >
          Built for high productivity & reliability
        </Text>
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine]}>Jedidiah Equipment</Text>
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine]}>
          {JEDIDIAH_BUSINESS_DETAILS.address}
        </Text>
        {contactLine ? (
          <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine, styles.salesContactLine]}>
            {contactLine}
          </Text>
        ) : null}
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine]}>
          {`${JEDIDIAH_BUSINESS_DETAILS.companyRegistrationNumber} | VAT No. ${JEDIDIAH_BUSINESS_DETAILS.vatRegistrationNumber}`}
        </Text>
        <View style={[pdfStyles.bgBrandYellow, styles.brandStripe]} />
      </View>
      <View style={[pdfStyles.bgBrandYellow, pdfStyles.colorBlack, pdfStyles.textRight, styles.bankPanel]}>
        <View style={styles.documentHeading}>
          <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.documentDate]}>
            {formatDate(document.issueDate, 'short')}
          </Text>
          <Text
            style={[pdfStyles.fontBold, pdfStyles.textTitle, pdfStyles.uppercase, styles.documentTitleText]}
            wrap={false}
          >
            Quotation
          </Text>
          <Text style={[pdfStyles.fontSemibold, pdfStyles.textBodyLg, styles.quoteCode]} wrap={false}>
            {document.quoteCode}
          </Text>
        </View>
        <View style={styles.bankDetails}>
          <Text style={[pdfStyles.fontBold, pdfStyles.textEyebrow, pdfStyles.uppercase, styles.bankTitle]}>
            Banking Details
          </Text>
          <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.bankLine]}>Bank: FNB</Text>
          <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.bankLine]}>Acc no: 62835496599</Text>
          <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.bankLine]}>Branch: 220-122</Text>
          <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.bankLine]}>
            Reference: {document.quoteCode}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function getSalesContactLine(document: QuoteDocumentModel): string | null {
  const email = document.salesPerson?.email.trim();
  const phoneNumber = formatPhoneNumber(document.salesPerson?.phoneNumber);
  const contactParts = [email ? `Email: ${email}` : null, phoneNumber ? `Cell: ${phoneNumber}` : null].filter(
    (part): part is string => part !== null,
  );

  return contactParts.length > 0 ? contactParts.join(' | ') : null;
}
