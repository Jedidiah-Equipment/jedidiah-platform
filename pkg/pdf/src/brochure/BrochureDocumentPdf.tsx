import { type BrochureDocumentImage, type BrochureDocumentModel, PRODUCT_KEY_FEATURES_MAX_COUNT } from '@pkg/schema';
import { Document, Image, Page, StyleSheet, type Styles, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../pdf-fonts.js';
import { jedidiahFooterBannerSrc, jedidiahLogoSrc } from '../pdf-logo.js';
import { pdfColors, pdfFontSize, pdfFontWeight, pdfLineHeight } from '../quote-document/pdf-theme.js';

type Style = Styles[string];

type BrochureDocumentPdfProps = {
  document: BrochureDocumentModel;
};

type ImageFit = NonNullable<BrochureDocumentImage>['fit'];

const layout = {
  pagePaddingX: 18,
  coverPaddingTop: 38,
  detailPaddingTop: 24,
  brandLogoHeight: 36,
  brandLogoWidth: 126,
  rangeLogoHeight: 44,
  rangeLogoWidth: 166,
  heroHeight: 400,
  techImageHeight: 142,
  secondaryHeight: 225,
  footerHeight: 98,
  footerLogoHeight: 34,
  footerLogoWidth: 120,
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: pdfColors.white,
    color: pdfColors.black,
    fontFamily: pdfFontFamily,
    fontSize: pdfFontSize.body,
    lineHeight: pdfLineHeight.body,
  },
  coverContent: {
    paddingHorizontal: layout.pagePaddingX,
    paddingTop: layout.coverPaddingTop,
  },
  detailPage: {
    flexDirection: 'column',
    minHeight: '100%',
  },
  detailContent: {
    paddingHorizontal: layout.pagePaddingX,
    paddingTop: layout.detailPaddingTop,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 38,
  },
  brandLogoFrame: {
    backgroundColor: pdfColors.black,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  brandLogo: {
    height: layout.brandLogoHeight,
    objectFit: 'contain',
    width: layout.brandLogoWidth,
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
    marginBottom: 17,
  },
  eyebrow: {
    color: pdfColors.black,
    fontSize: 18,
    fontWeight: pdfFontWeight.bold,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  title: {
    color: pdfColors.black,
    fontFamily: pdfTitleFontFamily,
    fontSize: 48,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  imageBox: {
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
    marginTop: 86,
  },
  centerHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },
  headingDark: {
    fontFamily: pdfTitleFontFamily,
    fontSize: 20,
    fontWeight: pdfFontWeight.bold,
    textTransform: 'uppercase',
  },
  headingAccent: {
    color: pdfColors.yellowLight,
    fontFamily: pdfTitleFontFamily,
    fontSize: 20,
    fontWeight: pdfFontWeight.bold,
    textTransform: 'uppercase',
  },
  featureList: {
    alignSelf: 'center',
    width: 260,
  },
  detailSpacer: {
    flexGrow: 1,
  },
  keyFeatureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 9,
  },
  keyFeatureIcon: {
    height: 9,
    marginRight: 13,
    width: 21,
  },
  trailerBed: {
    backgroundColor: pdfColors.black,
    height: 6,
    width: 18,
  },
  trailerTow: {
    backgroundColor: pdfColors.black,
    height: 2,
    marginLeft: 15,
    marginTop: -2,
    width: 6,
  },
  trailerWheels: {
    flexDirection: 'row',
    gap: 5,
    marginLeft: 3,
    marginTop: -1,
  },
  trailerWheel: {
    backgroundColor: pdfColors.black,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  keyFeatureText: {
    color: pdfColors.black,
    flex: 1,
    fontSize: 10.5,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1.15,
    textTransform: 'uppercase',
  },
  bulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 1.7,
  },
  bulletDot: {
    backgroundColor: pdfColors.black,
    borderRadius: 2,
    height: 4,
    marginRight: 9,
    marginTop: 3.3,
    width: 4,
  },
  bulletText: {
    color: pdfColors.black,
    flex: 1,
    fontSize: 6.8,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1.18,
    textTransform: 'uppercase',
  },
  techImageBox: {
    height: layout.techImageHeight,
    marginBottom: 2,
    overflow: 'hidden',
    width: '100%',
  },
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginLeft: 32,
    width: 473,
  },
  assemblyColumn: {
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 7,
    width: 198,
  },
  standardColumn: {
    borderBottomColor: pdfColors.black,
    borderLeftColor: pdfColors.black,
    borderRightColor: pdfColors.black,
    borderTopColor: pdfColors.black,
  },
  optionalColumn: {
    borderBottomColor: pdfColors.yellowLight,
    borderLeftColor: pdfColors.yellowLight,
    borderRightColor: pdfColors.yellowLight,
    borderTopColor: pdfColors.yellowLight,
  },
  columnHeading: {
    fontSize: 7.3,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1,
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  secondaryBox: {
    height: layout.secondaryHeight,
    marginBottom: 7,
    overflow: 'hidden',
    width: '100%',
  },
  yellowRule: {
    backgroundColor: pdfColors.yellowLight,
    height: 2.4,
    marginBottom: 6,
    marginHorizontal: 15,
  },
  bodyCopy: {
    color: pdfColors.black,
    fontSize: 7.4,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1.43,
    marginBottom: 2,
    paddingHorizontal: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  footer: {
    alignItems: 'center',
    backgroundColor: pdfColors.black,
    flexDirection: 'row',
    height: layout.footerHeight,
    justifyContent: 'space-between',
    marginBottom: layout.pagePaddingX,
    marginHorizontal: layout.pagePaddingX,
    marginTop: 16,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 10,
    position: 'relative',
  },
  footerBackground: {
    bottom: 0,
    height: '100%',
    left: 0,
    objectFit: 'cover',
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  footerContactBlock: {
    flexGrow: 0,
    width: 178,
  },
  footerContactGroup: {
    marginBottom: 9,
  },
  footerContact: {
    color: pdfColors.white,
    fontSize: 6.2,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1.35,
    textTransform: 'uppercase',
  },
  footerWebsite: {
    textDecoration: 'underline',
    textTransform: 'none',
  },
  footerRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  footerLogoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
    width: '100%',
  },
  footerTagline: {
    color: pdfColors.white,
    fontSize: 12.5,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1,
    marginBottom: 9,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  footerAddress: {
    color: pdfColors.white,
    fontSize: 6.8,
    fontWeight: pdfFontWeight.bold,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
});

export function BrochureDocumentPdf({ document }: BrochureDocumentPdfProps) {
  const hasColumns = document.standardAssemblies.length > 0 || document.optionalAssemblies.length > 0;
  const coverLayout = getCoverLayout(document.keyFeatures.length);
  const detailLayout = getDetailLayout(document);

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
        <View style={styles.coverContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandLogoFrame}>
              <Image src={jedidiahLogoSrc} style={styles.brandLogo} />
            </View>
            {document.rangeLogo ? (
              <Image src={document.rangeLogo.dataUri} style={styles.rangeLogo} />
            ) : (
              <View style={styles.rangeLogoFallback} />
            )}
          </View>

          <View style={styles.titleBlock}>
            {document.subtitle ? <Text style={styles.eyebrow}>{document.subtitle}</Text> : null}
            <TitleText title={document.title} />
          </View>

          {document.images.primary ? (
            <CoverImage image={document.images.primary} style={[styles.imageBox, { height: coverLayout.heroHeight }]} />
          ) : null}

          {document.keyFeatures.length > 0 ? (
            <View style={[styles.sectionCentered, { marginTop: coverLayout.sectionMarginTop }]}>
              <View style={[styles.centerHeadingRow, { marginBottom: coverLayout.headingMarginBottom }]}>
                <Text style={[styles.headingDark, { fontSize: coverLayout.headingFontSize }]}>Key </Text>
                <Text style={[styles.headingAccent, { fontSize: coverLayout.headingFontSize }]}>Features</Text>
              </View>
              <View style={[styles.featureList, { width: coverLayout.featureListWidth }]}>
                {document.keyFeatures.map((feature) => (
                  <KeyFeatureItem key={feature} label={feature} layout={coverLayout} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Page>

      <Page size="A4" style={[styles.page, styles.detailPage]}>
        <View style={styles.detailContent}>
          {document.images.technicalDrawing ? (
            <CoverImage image={document.images.technicalDrawing} style={styles.techImageBox} />
          ) : null}

          {hasColumns ? (
            <View style={[styles.columns, { marginBottom: detailLayout.assembly.columnsMarginBottom }]}>
              <SpecColumn
                accent="standard"
                heading="Standard"
                items={document.standardAssemblies}
                layout={detailLayout.assembly}
              />
              <SpecColumn
                accent="optional"
                heading="Optional Extras"
                items={document.optionalAssemblies}
                layout={detailLayout.assembly}
              />
            </View>
          ) : null}

          {document.images.banner ? <CoverImage image={document.images.banner} style={styles.secondaryBox} /> : null}

          {document.bodyCopy.length > 0 ? <View style={styles.yellowRule} /> : null}
          {document.bodyCopy.map((paragraph) => (
            <Text key={paragraph} style={[styles.bodyCopy, detailLayout.bodyCopy]}>
              {paragraph}
            </Text>
          ))}
        </View>
        <View style={styles.detailSpacer} />
        <Footer />
      </Page>
    </Document>
  );
}

function TitleText({ title }: { title: string }) {
  const upperTitle = title.toUpperCase();

  // Accent spans should come from brochure config later; avoid hardcoding product-specific regex here.

  return (
    <Text style={styles.title} wrap={false}>
      {upperTitle}
    </Text>
  );
}

type CoverLayout = {
  featureFontSize: number;
  featureLineHeight: number;
  featureListWidth: number;
  headingFontSize: number;
  headingMarginBottom: number;
  heroHeight: number;
  rowMarginBottom: number;
  sectionMarginTop: number;
};

type DetailLayout = {
  assembly: AssemblyLayout;
  bodyCopy: BodyCopyLayout;
};

type AssemblyLayout = {
  bulletDotSize: number;
  bulletDotTop: number;
  bulletMarginBottom: number;
  bulletTextFontSize: number;
  bulletTextLineHeight: number;
  columnHeadingFontSize: number;
  columnHeadingMarginBottom: number;
  columnPaddingBottom: number;
  columnPaddingX: number;
  columnPaddingTop: number;
  columnsMarginBottom: number;
};

type BodyCopyLayout = {
  fontSize: number;
  lineHeight: number;
  marginBottom: number;
};

function getCoverLayout(featureCount: number): CoverLayout {
  if (featureCount <= 3) {
    return {
      featureFontSize: 10.5,
      featureLineHeight: 1.15,
      featureListWidth: 260,
      headingFontSize: 20,
      headingMarginBottom: 18,
      heroHeight: layout.heroHeight,
      rowMarginBottom: 9,
      sectionMarginTop: 86,
    };
  }

  if (featureCount <= 6) {
    return {
      featureFontSize: 9,
      featureLineHeight: 1.1,
      featureListWidth: 310,
      headingFontSize: 18,
      headingMarginBottom: 12,
      heroHeight: 360,
      rowMarginBottom: 5,
      sectionMarginTop: 48,
    };
  }

  return {
    featureFontSize: 7.2,
    featureLineHeight: 1.05,
    featureListWidth: 340,
    headingFontSize: 16,
    headingMarginBottom: 8,
    heroHeight: 318,
    rowMarginBottom: featureCount >= PRODUCT_KEY_FEATURES_MAX_COUNT ? 2 : 3,
    sectionMarginTop: 30,
  };
}

function getDetailLayout(document: BrochureDocumentModel): DetailLayout {
  return {
    assembly: getAssemblyLayout(document.standardAssemblies, document.optionalAssemblies),
    bodyCopy: getBodyCopyLayout(document.bodyCopy),
  };
}

function getAssemblyLayout(standardItems: string[], optionalItems: string[]): AssemblyLayout {
  const pressure = Math.max(estimateAssemblyPressure(standardItems), estimateAssemblyPressure(optionalItems));

  if (pressure <= 18) {
    return {
      bulletDotSize: 4,
      bulletDotTop: 3.3,
      bulletMarginBottom: 1.7,
      bulletTextFontSize: 6.8,
      bulletTextLineHeight: 1.18,
      columnHeadingFontSize: 7.3,
      columnHeadingMarginBottom: 8,
      columnPaddingBottom: 6,
      columnPaddingX: 18,
      columnPaddingTop: 7,
      columnsMarginBottom: 18,
    };
  }

  if (pressure <= 26) {
    return {
      bulletDotSize: 3.4,
      bulletDotTop: 2.8,
      bulletMarginBottom: 0.9,
      bulletTextFontSize: 6,
      bulletTextLineHeight: 1.1,
      columnHeadingFontSize: 6.8,
      columnHeadingMarginBottom: 6,
      columnPaddingBottom: 5,
      columnPaddingX: 16,
      columnPaddingTop: 6,
      columnsMarginBottom: 15,
    };
  }

  if (pressure <= 34) {
    return {
      bulletDotSize: 2.9,
      bulletDotTop: 2.4,
      bulletMarginBottom: 0.4,
      bulletTextFontSize: 5,
      bulletTextLineHeight: 1.04,
      columnHeadingFontSize: 6.2,
      columnHeadingMarginBottom: 4,
      columnPaddingBottom: 4,
      columnPaddingX: 14,
      columnPaddingTop: 5,
      columnsMarginBottom: 12,
    };
  }

  return {
    bulletDotSize: 2.4,
    bulletDotTop: 2,
    bulletMarginBottom: 0.1,
    bulletTextFontSize: 4,
    bulletTextLineHeight: 1,
    columnHeadingFontSize: 5.2,
    columnHeadingMarginBottom: 3,
    columnPaddingBottom: 3,
    columnPaddingX: 12,
    columnPaddingTop: 4,
    columnsMarginBottom: 8,
  };
}

function estimateAssemblyPressure(items: string[]): number {
  return items.reduce((total, item) => total + Math.max(1, Math.ceil(item.length / 38)), 0);
}

function getBodyCopyLayout(paragraphs: string[]): BodyCopyLayout {
  const estimatedLines = paragraphs.reduce(
    (total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / 105)),
    0,
  );

  if (estimatedLines <= 5) {
    return { fontSize: 7.4, lineHeight: 1.43, marginBottom: 2 };
  }

  if (estimatedLines <= 7) {
    return { fontSize: 6.8, lineHeight: 1.34, marginBottom: 1.5 };
  }

  if (estimatedLines <= 10) {
    return { fontSize: 6.1, lineHeight: 1.24, marginBottom: 1 };
  }

  return { fontSize: 5.4, lineHeight: 1.16, marginBottom: 0.6 };
}

function KeyFeatureItem({ label, layout }: { label: string; layout: CoverLayout }) {
  return (
    <View style={[styles.keyFeatureRow, { marginBottom: layout.rowMarginBottom }]}>
      <View style={styles.keyFeatureIcon}>
        <View style={styles.trailerBed} />
        <View style={styles.trailerTow} />
        <View style={styles.trailerWheels}>
          <View style={styles.trailerWheel} />
          <View style={styles.trailerWheel} />
        </View>
      </View>
      <Text style={[styles.keyFeatureText, { fontSize: layout.featureFontSize, lineHeight: layout.featureLineHeight }]}>
        {label}
      </Text>
    </View>
  );
}

function BulletItem({ label, layout }: { label: string; layout: AssemblyLayout }) {
  return (
    <View style={[styles.bulletRow, { marginBottom: layout.bulletMarginBottom }]}>
      <View
        style={[
          styles.bulletDot,
          {
            borderRadius: layout.bulletDotSize / 2,
            height: layout.bulletDotSize,
            marginTop: layout.bulletDotTop,
            width: layout.bulletDotSize,
          },
        ]}
      />
      <Text
        style={[styles.bulletText, { fontSize: layout.bulletTextFontSize, lineHeight: layout.bulletTextLineHeight }]}
      >
        {label}
      </Text>
    </View>
  );
}

function SpecColumn({
  accent,
  heading,
  items,
  layout,
}: {
  accent: 'optional' | 'standard';
  heading: string;
  items: string[];
  layout: AssemblyLayout;
}) {
  return (
    <View
      style={[
        styles.assemblyColumn,
        {
          paddingBottom: layout.columnPaddingBottom,
          paddingHorizontal: layout.columnPaddingX,
          paddingTop: layout.columnPaddingTop,
        },
        accent === 'standard' ? styles.standardColumn : styles.optionalColumn,
      ]}
    >
      <Text
        style={[
          styles.columnHeading,
          { fontSize: layout.columnHeadingFontSize, marginBottom: layout.columnHeadingMarginBottom },
        ]}
      >
        {heading}
      </Text>
      {items.map((item) => (
        <BulletItem key={item} label={item} layout={layout} />
      ))}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer}>
      <Image src={jedidiahFooterBannerSrc} style={styles.footerBackground} />
      <View style={styles.footerContactBlock}>
        <View style={styles.footerContactGroup}>
          <Text style={styles.footerContact}>Phone: 045 050 0545</Text>
          <Text style={[styles.footerContact, styles.footerWebsite]}>www.jedidiahequipment.co.za</Text>
        </View>
        <View style={styles.footerContactGroup}>
          <Text style={styles.footerContact}>Dewald Van Niekerk 083 331 9183,</Text>
          <Text style={styles.footerContact}>factory@jedidiahequipment.co.za</Text>
        </View>
        <View>
          <Text style={styles.footerContact}>Jed Van Niekerk 082 419 4464,</Text>
          <Text style={styles.footerContact}>jed@jedidiahequipment.co.za</Text>
        </View>
      </View>
      <View style={styles.footerRight}>
        <View style={styles.footerLogoRow}>
          <Image
            src={jedidiahLogoSrc}
            style={{ height: layout.footerLogoHeight, objectFit: 'contain', width: layout.footerLogoWidth }}
          />
        </View>
        <Text style={styles.footerTagline}>Built for high productivity and reliability</Text>
        <Text style={styles.footerAddress}>Stoneybrook Farm, Kokstad, KwaZulu-Natal, South Africa</Text>
      </View>
    </View>
  );
}

function CoverImage({ fit, image, style }: { fit?: ImageFit; image: BrochureDocumentImage; style: Style | Style[] }) {
  if (!image) {
    return null;
  }

  return (
    <View style={style}>
      <Image src={image.dataUri} style={[styles.coverImage, { objectFit: fit ?? image.fit }]} />
    </View>
  );
}
