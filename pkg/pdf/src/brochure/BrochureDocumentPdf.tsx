import type { BrochureDocumentImage, BrochureDocumentModel } from '@pkg/schema';
import { Document, Image, Page, StyleSheet, type Styles, Text, View } from '@react-pdf/renderer';

import { JEDIDIAH_LOGO_DATA_URI } from '../quote-document/jedidiah-logo.js';
import { pdfColors, pdfFontSize, pdfFontWeight, pdfLineHeight } from '../quote-document/pdf-theme.js';

type Style = Styles[string];

type BrochureDocumentPdfProps = {
  document: BrochureDocumentModel;
};

const layout = {
  pagePadding: 28,
  brandLogoHeight: 34,
  rangeLogoHeight: 34,
  rangeLogoWidth: 150,
  heroHeight: 320,
  techImageHeight: 150,
  secondaryHeight: 230,
  footerLogoHeight: 30,
  footerLogoWidth: 104,
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: pdfColors.white,
    color: pdfColors.black,
    fontFamily: 'Helvetica',
    fontSize: pdfFontSize.body,
    lineHeight: pdfLineHeight.body,
  },
  content: {
    paddingHorizontal: layout.pagePadding,
    paddingTop: layout.pagePadding,
  },
  // The second page is a full-height column so the footer band can pin to the bottom of the page.
  secondPage: {
    flexDirection: 'column',
    minHeight: '100%',
  },
  spacer: {
    flexGrow: 1,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  brandLogo: {
    height: layout.brandLogoHeight,
    objectFit: 'contain',
    width: 150,
  },
  rangeLogo: {
    height: layout.rangeLogoHeight,
    objectFit: 'contain',
    width: layout.rangeLogoWidth,
  },
  rangeLogoFallback: {
    height: layout.rangeLogoHeight,
    width: layout.rangeLogoWidth,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 18,
  },
  eyebrow: {
    color: pdfColors.mutedDark,
    fontSize: pdfFontSize.bodyLg,
    fontWeight: pdfFontWeight.semibold,
    letterSpacing: 3,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: pdfColors.black,
    fontSize: 30,
    fontWeight: pdfFontWeight.bold,
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  imageRounded: {
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%',
  },
  coverImage: {
    height: '100%',
    objectFit: 'cover',
    width: '100%',
  },
  sectionCentered: {
    alignItems: 'center',
    marginTop: 22,
  },
  centerHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headingDark: {
    fontSize: pdfFontSize.title,
    fontWeight: pdfFontWeight.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headingAccent: {
    color: pdfColors.yellow,
    fontSize: pdfFontSize.title,
    fontWeight: pdfFontWeight.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  featureList: {
    alignSelf: 'center',
    width: '70%',
  },
  checkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 7,
  },
  checkBox: {
    alignItems: 'center',
    backgroundColor: pdfColors.black,
    borderRadius: 2,
    height: 12,
    justifyContent: 'center',
    marginRight: 8,
    width: 12,
  },
  checkMark: {
    color: pdfColors.white,
    fontSize: 8,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1,
  },
  checkText: {
    color: pdfColors.mutedDark,
    flex: 1,
    fontSize: pdfFontSize.body,
    fontWeight: pdfFontWeight.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  techImageBox: {
    borderRadius: 8,
    height: layout.techImageHeight,
    marginBottom: 20,
    overflow: 'hidden',
    width: '100%',
  },
  columns: {
    flexDirection: 'row',
    gap: 28,
    marginBottom: 20,
  },
  column: {
    flex: 1,
  },
  columnHeading: {
    borderBottomColor: pdfColors.yellow,
    borderBottomWidth: 2,
    fontSize: pdfFontSize.bodyLg,
    fontWeight: pdfFontWeight.bold,
    letterSpacing: 1,
    marginBottom: 10,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  secondaryBox: {
    borderRadius: 8,
    height: layout.secondaryHeight,
    marginBottom: 16,
    overflow: 'hidden',
    width: '100%',
  },
  bodyCopy: {
    color: pdfColors.mutedDark,
    fontSize: pdfFontSize.body,
    marginBottom: 4,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    backgroundColor: pdfColors.black,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingHorizontal: layout.pagePadding,
    paddingVertical: 16,
  },
  footerContact: {
    color: pdfColors.mutedOnDark,
    fontSize: pdfFontSize.bodyXs,
    lineHeight: 1.5,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerTagline: {
    color: pdfColors.white,
    fontSize: pdfFontSize.body,
    fontWeight: pdfFontWeight.bold,
    letterSpacing: 0.5,
    marginBottom: 3,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  footerAddress: {
    color: pdfColors.mutedOnDark,
    fontSize: pdfFontSize.bodyXs,
  },
});

export function BrochureDocumentPdf({ document }: BrochureDocumentPdfProps) {
  const hasColumns = document.standardAssemblies.length > 0 || document.optionalAssemblies.length > 0;
  const hasSecondPage =
    hasColumns ||
    Boolean(document.images.technicalDrawing) ||
    Boolean(document.images.secondary) ||
    document.bodyCopy.length > 0;

  return (
    <Document
      author="Jedidiah Equipment"
      creator="Jedidiah Platform"
      language="en"
      producer="Jedidiah Platform"
      subject={`Brochure ${document.modelCode}`}
      title={document.title}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <Image src={JEDIDIAH_LOGO_DATA_URI} style={styles.brandLogo} />
            {document.images.rangeLogo ? (
              <Image src={document.images.rangeLogo.dataUri} style={styles.rangeLogo} />
            ) : (
              <View style={styles.rangeLogoFallback} />
            )}
          </View>

          <View style={styles.titleBlock}>
            {document.subtitle ? <Text style={styles.eyebrow}>{document.subtitle}</Text> : null}
            <Text style={styles.title} wrap={false}>
              {document.title}
            </Text>
          </View>

          {document.images.hero ? (
            <CoverImage image={document.images.hero} style={[styles.imageRounded, { height: layout.heroHeight }]} />
          ) : null}

          {document.keyFeatures.length > 0 ? (
            <View style={styles.sectionCentered}>
              <View style={styles.centerHeadingRow}>
                <Text style={styles.headingDark}>Key </Text>
                <Text style={styles.headingAccent}>Features</Text>
              </View>
              <View style={styles.featureList}>
                {document.keyFeatures.map((feature) => (
                  <CheckItem key={feature} label={feature} />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {hasSecondPage ? (
          <View break style={styles.secondPage}>
            <View style={styles.content}>
              {document.images.technicalDrawing ? (
                <CoverImage image={document.images.technicalDrawing} style={styles.techImageBox} />
              ) : null}

              {hasColumns ? (
                <View style={styles.columns}>
                  {document.standardAssemblies.length > 0 ? (
                    <SpecColumn heading="Standard" items={document.standardAssemblies} />
                  ) : null}
                  {document.optionalAssemblies.length > 0 ? (
                    <SpecColumn heading="Optional Extras" items={document.optionalAssemblies} />
                  ) : null}
                </View>
              ) : null}

              {document.images.secondary ? (
                <CoverImage image={document.images.secondary} style={styles.secondaryBox} />
              ) : null}

              {document.bodyCopy.map((paragraph) => (
                <Text key={paragraph} style={styles.bodyCopy}>
                  {paragraph}
                </Text>
              ))}
            </View>
            <View style={styles.spacer} />
            <Footer document={document} />
          </View>
        ) : (
          <Footer document={document} />
        )}
      </Page>
    </Document>
  );
}

function CheckItem({ label }: { label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkBox}>
        <Text style={styles.checkMark}>✓</Text>
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

function SpecColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnHeading}>{heading}</Text>
      {items.map((item) => (
        <CheckItem key={item} label={item} />
      ))}
    </View>
  );
}

function Footer({ document }: { document: BrochureDocumentModel }) {
  return (
    <View style={styles.footer}>
      <View>
        <Text style={styles.footerContact}>Jedidiah Equipment</Text>
        <Text style={styles.footerContact}>sales@jedidiahequipment.co.za</Text>
        <Text style={styles.footerContact}>{document.modelCode}</Text>
      </View>
      <View style={styles.footerRight}>
        <Image
          src={JEDIDIAH_LOGO_DATA_URI}
          style={{ height: layout.footerLogoHeight, width: layout.footerLogoWidth }}
        />
        <Text style={styles.footerTagline}>Built for high productivity &amp; reliability</Text>
        <Text style={styles.footerAddress}>Stoneybrook Farm, Kokstad, KwaZulu-Natal, South Africa</Text>
      </View>
    </View>
  );
}

function CoverImage({ image, style }: { image: BrochureDocumentImage; style: Style | Style[] }) {
  if (!image) {
    return null;
  }

  return (
    <View style={style}>
      <Image src={image.dataUri} style={[styles.coverImage, { objectFit: image.fit }]} />
    </View>
  );
}
