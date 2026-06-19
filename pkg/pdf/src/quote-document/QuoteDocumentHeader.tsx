import { formatDate, formatPhoneNumber } from '@pkg/domain';
import type { QuoteDocumentModel } from '@pkg/schema';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../pdf-fonts.js';
import { JEDIDIAH_LOGO_DATA_URI } from './jedidiah-logo.js';
import { pdfStyles } from './pdf-styles.js';

type QuoteDocumentHeaderProps = {
  document: QuoteDocumentModel;
};

const layout = {
  documentPanelWidth: 210,
  logoFrameHeight: 42,
  logoFrameWidth: 172,
  logoHeight: 50,
  logoWidth: 178,
} as const;

const styles = StyleSheet.create({
  brandPanel: {
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
    height: layout.logoFrameHeight,
    marginBottom: 4,
    overflow: 'hidden',
    width: layout.logoFrameWidth,
  },
  logo: {
    height: layout.logoHeight,
    marginLeft: -2,
    marginTop: -3,
    width: layout.logoWidth,
  },
  tagline: {
    fontStyle: 'italic',
    marginBottom: 13,
  },
  brandLine: {
    marginBottom: 3,
  },
  documentPanel: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: layout.documentPanelWidth,
  },
  documentPanelTitle: {
    alignItems: 'flex-end',
  },
  documentTitleText: {
    fontFamily: pdfTitleFontFamily,
  },
  quoteCode: {
    fontFamily: pdfTitleFontFamily,
    marginTop: 12,
  },
  headerMeta: {
    alignItems: 'flex-end',
  },
  metaBlock: {
    alignItems: 'flex-end',
    marginTop: 12,
  },
});

export function QuoteDocumentHeader({ document }: QuoteDocumentHeaderProps) {
  const contactLine = getSalesContactLine(document);

  return (
    <View style={pdfStyles.flexRow}>
      <View
        style={[pdfStyles.bgBlack, pdfStyles.colorWhite, pdfStyles.flex1, pdfStyles.panelPadding, styles.brandPanel]}
      >
        <View style={styles.logoFrame}>
          <Image src={JEDIDIAH_LOGO_DATA_URI} style={styles.logo} />
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
          Stoneybrook Farm, Kokstad, 4700
        </Text>
        {contactLine ? (
          <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine]}>{contactLine}</Text>
        ) : null}
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyXs, styles.brandLine]}>
          C/K 2019/513612/07 | VAT No. 4420294821
        </Text>
        <View style={[pdfStyles.bgBrandYellow, styles.brandStripe]} />
      </View>
      <View
        style={[
          pdfStyles.bgBrandYellow,
          pdfStyles.colorBlack,
          pdfStyles.panelPadding,
          pdfStyles.textRight,
          styles.documentPanel,
        ]}
      >
        <View style={styles.documentPanelTitle}>
          <Text
            style={[pdfStyles.fontBold, pdfStyles.textTitle, pdfStyles.uppercase, styles.documentTitleText]}
            wrap={false}
          >
            Quotation
          </Text>
          <Text style={[pdfStyles.fontSemibold, pdfStyles.textHeading, styles.quoteCode]} wrap={false}>
            {document.quoteCode}
          </Text>
        </View>
        <View style={styles.headerMeta}>
          <HeaderMeta label="Quote Date" value={formatDate(document.issueDate, 'short')} />
          <HeaderMeta label="Prepared By" value={document.salesPerson?.name ?? 'Jedidiah Equipment'} />
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

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaBlock}>
      <Text style={[pdfStyles.fontBold, pdfStyles.textBodyXs, pdfStyles.uppercase]}>{label}</Text>
      <Text style={[pdfStyles.fontMedium, pdfStyles.textBodyLg]}>{value}</Text>
    </View>
  );
}
