import {
  type BrochureDocumentImage,
  type BrochureDocumentModel,
  type Locale,
  PRODUCT_KEY_FEATURES_MAX_COUNT,
} from '@pkg/schema';
import { Document, Image, Page, Path, StyleSheet, type Styles, Svg, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../pdf-fonts.js';
import { jedidiahFooterBannerSrc, jedidiahLogoSrc } from '../pdf-logo.js';
import { pdfColors, pdfFontSize, pdfFontWeight, pdfLineHeight } from '../quote-document/pdf-theme.js';
import { brochureMessages } from './messages/index.js';

type Style = Styles[string];

type BrochureDocumentPdfProps = {
  document: BrochureDocumentModel;
  locale?: Locale;
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
  secondaryHeight: 205,
  footerHeight: 98,
  footerLogoHeight: 34,
  footerLogoWidth: 120,
  // Detail page sections have fixed heights so the layout is stable across products; text inside the
  // assembly boxes and the description is sized for best fit (see fitAssemblyText/fitDescriptionText).
  assemblyBoxHeight: 224,
  assemblyColumnWidth: 270,
  assemblyFrameTop: 10,
  assemblyHeaderHeight: 22,
  assemblyHeaderOffsetX: 14,
  assemblyContentPaddingX: 14,
  assemblyContentTop: 26,
  assemblyContentPaddingBottom: 8,
  descriptionHeight: 74,
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
    marginBottom: 22,
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
    marginBottom: 30,
  },
  eyebrow: {
    color: pdfColors.black,
    fontFamily: pdfTitleFontFamily,
    fontSize: 20,
    fontWeight: pdfFontWeight.bold,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: pdfColors.black,
    fontFamily: pdfTitleFontFamily,
    fontSize: 52,
    fontWeight: pdfFontWeight.bold,
    lineHeight: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  // Accents a substring of the title, matching the yellow used for the "Features" heading accent.
  titleHighlight: {
    color: pdfColors.yellowLight,
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
    height: 13,
    marginRight: 10,
    width: 13,
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
    flexShrink: 0,
    flexDirection: 'row',
    marginBottom: 1.7,
  },
  bulletSquare: {
    marginRight: 8,
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
    marginBottom: 16,
    overflow: 'hidden',
    width: '100%',
  },
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  assemblyColumn: {
    height: layout.assemblyBoxHeight,
    position: 'relative',
    width: layout.assemblyColumnWidth,
  },
  assemblyFrame: {
    borderColor: pdfColors.mutedDark,
    borderWidth: 2.1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: layout.assemblyFrameTop,
  },
  assemblyHeader: {
    height: layout.assemblyHeaderHeight,
    left: layout.assemblyHeaderOffsetX,
    position: 'relative',
    top: 0,
  },
  assemblyHeaderSvg: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  assemblyHeaderText: {
    color: pdfColors.white,
    fontFamily: pdfTitleFontFamily,
    fontWeight: pdfFontWeight.bold,
    left: 0,
    position: 'absolute',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  assemblyList: {
    bottom: layout.assemblyContentPaddingBottom,
    left: 0,
    paddingHorizontal: layout.assemblyContentPaddingX,
    position: 'absolute',
    right: 0,
    top: layout.assemblyContentTop,
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
  descriptionTextWrap: {
    height: layout.descriptionHeight,
    justifyContent: 'center',
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
    marginBottom: 0,
    marginHorizontal: 0,
    marginTop: 10,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 10,
    position: 'relative',
    width: '100%',
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

export function BrochureDocumentPdf({ document, locale = 'en' }: BrochureDocumentPdfProps) {
  const hasColumns = document.standardAssemblies.length > 0 || document.optionalAssemblies.length > 0;
  const coverLayout = getCoverLayout(document.keyFeatures);
  const detailLayout = getDetailLayout(document);
  const messages = brochureMessages[locale];

  return (
    <Document
      author="Jedidiah Equipment"
      creator="Jedidiah Platform"
      language={locale}
      producer="Jedidiah Platform"
      subject={`${messages.subject} ${document.modelCode}`}
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
            <TitleText title={document.title} highlight={document.titleHighlight} />
          </View>

          {document.images.primary ? (
            <CoverImage image={document.images.primary} style={[styles.imageBox, { height: coverLayout.heroHeight }]} />
          ) : null}

          {document.keyFeatures.length > 0 ? (
            <View style={[styles.sectionCentered, { marginTop: coverLayout.sectionMarginTop }]}>
              <View style={[styles.centerHeadingRow, { marginBottom: coverLayout.headingMarginBottom }]}>
                <Text style={[styles.headingDark, { fontSize: coverLayout.headingFontSize }]}>
                  {messages.keyFeatures[0]}{' '}
                </Text>
                <Text style={[styles.headingAccent, { fontSize: coverLayout.headingFontSize }]}>
                  {messages.keyFeatures[1]}
                </Text>
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
            <View style={styles.columns}>
              <SpecColumn
                accent="standard"
                heading={messages.standardAssemblies}
                items={document.standardAssemblies}
                layout={detailLayout.assembly}
              />
              <SpecColumn
                accent="optional"
                heading={messages.optionalAssemblies}
                items={document.optionalAssemblies}
                layout={detailLayout.assembly}
              />
            </View>
          ) : null}

          {document.images.banner ? <CoverImage image={document.images.banner} style={styles.secondaryBox} /> : null}

          {document.bodyCopy.length > 0 ? (
            <View>
              <View style={styles.yellowRule} />
              <View style={styles.descriptionTextWrap}>
                {document.bodyCopy.map((paragraph) => (
                  <Text
                    key={paragraph}
                    style={[
                      styles.bodyCopy,
                      {
                        fontSize: detailLayout.description.fontSize,
                        lineHeight: detailLayout.description.lineHeight,
                        marginBottom: detailLayout.description.paragraphMarginBottom,
                      },
                    ]}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.detailSpacer} />
        <Footer messages={messages} />
      </Page>
    </Document>
  );
}

function TitleText({ title, highlight }: { title: string; highlight: string | null }) {
  const upperTitle = title.toUpperCase();
  const needle = highlight?.trim().toUpperCase();
  const at = needle ? upperTitle.indexOf(needle) : -1;

  // No highlight, or it isn't a substring of the title: render the whole title in the default colour.
  if (!needle || at === -1) {
    return (
      <Text style={styles.title} wrap={false}>
        {upperTitle}
      </Text>
    );
  }

  return (
    <Text style={styles.title} wrap={false}>
      {upperTitle.slice(0, at)}
      <Text style={styles.titleHighlight}>{upperTitle.slice(at, at + needle.length)}</Text>
      {upperTitle.slice(at + needle.length)}
    </Text>
  );
}

export type CoverLayout = {
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
  description: DescriptionLayout;
};

type AssemblyLayout = {
  fontSize: number;
  lineHeight: number;
  itemMarginBottom: number;
};

type DescriptionLayout = {
  fontSize: number;
  lineHeight: number;
  paragraphMarginBottom: number;
};

export function getCoverLayout(keyFeatures: string[]): CoverLayout {
  const featureCount = keyFeatures.length;
  const measuredFeatureListWidth = (baseWidth: number, fontSize: number) =>
    measureKeyFeatureListWidth(keyFeatures, baseWidth, fontSize);

  if (featureCount <= 3) {
    return {
      featureFontSize: 12.5,
      featureLineHeight: 1.15,
      featureListWidth: measuredFeatureListWidth(260, 12.5),
      headingFontSize: 24,
      headingMarginBottom: 34,
      heroHeight: layout.heroHeight,
      rowMarginBottom: 9,
      sectionMarginTop: 86,
    };
  }

  if (featureCount <= 6) {
    return {
      featureFontSize: 10.5,
      featureLineHeight: 1.1,
      featureListWidth: measuredFeatureListWidth(310, 10.5),
      headingFontSize: 21,
      headingMarginBottom: 22,
      heroHeight: 360,
      rowMarginBottom: 5,
      sectionMarginTop: 48,
    };
  }

  return {
    featureFontSize: 8,
    featureLineHeight: 1.05,
    featureListWidth: measuredFeatureListWidth(340, 8),
    headingFontSize: 18,
    headingMarginBottom: 8,
    heroHeight: 318,
    rowMarginBottom: featureCount >= PRODUCT_KEY_FEATURES_MAX_COUNT ? 2 : 3,
    sectionMarginTop: 30,
  };
}

// A4 page width in points (@react-pdf default); used to derive the fixed text widths for best-fit sizing.
const A4_WIDTH = 595.28;
// Per-character advance as a fraction of font size for the bold uppercase brand fonts. Tuned against
// rendered output; only needs to be close enough to estimate line wrapping for the best-fit search.
const ASSEMBLY_CHAR_WIDTH_FACTOR = 0.62;
const DESCRIPTION_CHAR_WIDTH_FACTOR = 0.52;
// Horizontal space a bullet square plus its gutter steals from each assembly line.
const ASSEMBLY_BULLET_GUTTER = 14;
const DESCRIPTION_PADDING_X = 20;
const KEY_FEATURE_CHAR_WIDTH_FACTOR = 0.62;
// Mirrors the 13pt star plus its 10pt right margin in the key-feature row.
const KEY_FEATURE_ICON_AND_GAP = 23;
const KEY_FEATURE_WIDTH_BUFFER = 8;
const KEY_FEATURE_MAX_WIDTH = 430;

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function measureKeyFeatureListWidth(keyFeatures: string[], baseWidth: number, fontSize: number): number {
  const longestLabelLength = Math.max(...keyFeatures.map((feature) => feature.trim().toUpperCase().length), 0);
  const measuredWidth = Math.ceil(
    longestLabelLength * fontSize * KEY_FEATURE_CHAR_WIDTH_FACTOR + KEY_FEATURE_ICON_AND_GAP + KEY_FEATURE_WIDTH_BUFFER,
  );

  return clampNumber(measuredWidth, baseWidth, KEY_FEATURE_MAX_WIDTH);
}

function getDetailLayout(document: BrochureDocumentModel): DetailLayout {
  return {
    assembly: fitAssemblyText(document.standardAssemblies, document.optionalAssemblies),
    description: fitDescriptionText(document.bodyCopy),
  };
}

// Picks the largest font size from a descending ladder that lets both assembly lists fit inside the
// fixed box height. Both columns share one size so they read as a matched pair.
function fitAssemblyText(standardItems: string[], optionalItems: string[]): AssemblyLayout {
  const availableHeight = layout.assemblyBoxHeight - layout.assemblyContentTop - layout.assemblyContentPaddingBottom;
  const textWidth = layout.assemblyColumnWidth - layout.assemblyContentPaddingX * 2 - ASSEMBLY_BULLET_GUTTER;
  const candidates = [9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4];

  for (const fontSize of candidates) {
    const lineHeight = fontSize < 6 ? 1.16 : 1.1;
    const itemMarginBottom = fontSize < 6 ? 1.2 : clampNumber(fontSize * 0.62, 3.8, 6.2);
    const fits = [standardItems, optionalItems].every(
      (items) =>
        measureListHeight(
          items,
          fontSize,
          lineHeight,
          itemMarginBottom,
          textWidth,
          assemblyCharWidthFactor(fontSize),
        ) <= availableHeight,
    );
    if (fits) {
      return { fontSize, lineHeight, itemMarginBottom };
    }
  }

  return { fontSize: 4, lineHeight: 1.16, itemMarginBottom: 1 };
}

function assemblyCharWidthFactor(fontSize: number): number {
  if (fontSize < 6) {
    return 0.86;
  }

  if (fontSize < 8) {
    return 0.74;
  }

  return ASSEMBLY_CHAR_WIDTH_FACTOR;
}

// Picks the largest description font size that fits the fixed description height.
function fitDescriptionText(paragraphs: string[]): DescriptionLayout {
  const availableHeight = layout.descriptionHeight;
  const textWidth = A4_WIDTH - layout.pagePaddingX * 2 - DESCRIPTION_PADDING_X * 2;
  const candidates = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5];

  for (const fontSize of candidates) {
    const lineHeight = 1.3;
    const paragraphMarginBottom = clampNumber(fontSize * 0.25, 1, 3);
    if (
      measureListHeight(
        paragraphs,
        fontSize,
        lineHeight,
        paragraphMarginBottom,
        textWidth,
        DESCRIPTION_CHAR_WIDTH_FACTOR,
      ) <= availableHeight
    ) {
      return { fontSize, lineHeight, paragraphMarginBottom };
    }
  }

  return { fontSize: 5, lineHeight: 1.18, paragraphMarginBottom: 0.5 };
}

// Estimates the rendered height of a wrapped list of lines at a given font size. Conservative (counts a
// trailing margin on every item) so the chosen size leaves a little slack rather than overflowing.
function measureListHeight(
  items: string[],
  fontSize: number,
  lineHeight: number,
  marginBottom: number,
  textWidth: number,
  charWidthFactor: number,
): number {
  const charsPerLine = Math.max(1, Math.floor(textWidth / (fontSize * charWidthFactor)));
  const totalLines = items.reduce((total, item) => total + Math.max(1, Math.ceil(item.length / charsPerLine)), 0);
  return totalLines * fontSize * lineHeight + items.length * marginBottom;
}

function KeyFeatureItem({ label, layout }: { label: string; layout: CoverLayout }) {
  return (
    <View style={[styles.keyFeatureRow, { marginBottom: layout.rowMarginBottom }]}>
      <Svg style={styles.keyFeatureIcon} viewBox="0 0 24 24">
        <Path
          d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z"
          fill={pdfColors.black}
        />
      </Svg>
      <Text style={[styles.keyFeatureText, { fontSize: layout.featureFontSize, lineHeight: layout.featureLineHeight }]}>
        {label}
      </Text>
    </View>
  );
}

function BulletItem({ label, layout: a, bulletColor }: { label: string; layout: AssemblyLayout; bulletColor: string }) {
  const bulletSize = clampNumber(a.fontSize * 0.66, 3.5, 6.2);
  return (
    <View style={[styles.bulletRow, { marginBottom: a.itemMarginBottom }]}>
      <View
        style={[
          styles.bulletSquare,
          { backgroundColor: bulletColor, height: bulletSize, marginTop: a.fontSize * 0.32, width: bulletSize },
        ]}
      />
      <Text style={[styles.bulletText, { fontSize: a.fontSize, lineHeight: a.lineHeight }]}>{label}</Text>
    </View>
  );
}

// The tab intentionally overlaps the frame top edge; that matches the legacy brochure artwork.
function SpecColumnHeader({ accent, heading }: { accent: 'optional' | 'standard'; heading: string }) {
  const headerHeight = layout.assemblyHeaderHeight;
  const fontSize = 13.5;
  const slant = 12;
  const tabPadX = 22;
  const maxTabWidth = layout.assemblyColumnWidth - layout.assemblyHeaderOffsetX - 36;
  const tabWidth = clampNumber(heading.length * fontSize * 0.63 + tabPadX * 2, 112, maxTabWidth);
  const fillColor = accent === 'standard' ? pdfColors.black : pdfColors.yellowLight;
  const textColor = accent === 'standard' ? pdfColors.white : pdfColors.black;
  const textLeft = layout.assemblyContentPaddingX;
  const textTop = (headerHeight - fontSize) / 2 - 4.2;

  return (
    <View style={[styles.assemblyHeader, { width: tabWidth + slant }]}>
      <Svg
        height={headerHeight}
        style={styles.assemblyHeaderSvg}
        viewBox={`0 0 ${tabWidth + slant} ${headerHeight}`}
        width={tabWidth + slant}
      >
        <Path d={`M0 0 L${tabWidth + slant} 0 L${tabWidth} ${headerHeight} L0 ${headerHeight} Z`} fill={fillColor} />
      </Svg>
      <Text
        style={[
          styles.assemblyHeaderText,
          { color: textColor, fontSize, left: textLeft, textAlign: 'left', top: textTop, width: tabWidth - textLeft },
        ]}
      >
        {heading}
      </Text>
    </View>
  );
}

function SpecColumn({
  accent,
  heading,
  items,
  layout: a,
}: {
  accent: 'optional' | 'standard';
  heading: string;
  items: string[];
  layout: AssemblyLayout;
}) {
  return (
    <View style={styles.assemblyColumn}>
      <View style={styles.assemblyFrame} />
      <SpecColumnHeader accent={accent} heading={heading} />
      <View style={styles.assemblyList}>
        {items.map((item) => (
          <BulletItem bulletColor={pdfColors.yellowLight} key={item} label={item} layout={a} />
        ))}
      </View>
    </View>
  );
}

function Footer({ messages }: { messages: (typeof brochureMessages)[Locale] }) {
  return (
    <View style={styles.footer}>
      <Image src={jedidiahFooterBannerSrc} style={styles.footerBackground} />
      <View style={styles.footerContactBlock}>
        <View style={styles.footerContactGroup}>
          <Text style={styles.footerContact}>{messages.phone}: 045 050 0545</Text>
          <Text style={[styles.footerContact, styles.footerWebsite]}>www.jedidiahequipment.co.za</Text>
        </View>
        <View style={styles.footerContactGroup}>
          <Text style={styles.footerContact}>Dewald Van Niekerk 083 331 9183</Text>
          <Text style={styles.footerContact}>factory@jedidiahequipment.co.za</Text>
        </View>
        <View>
          <Text style={styles.footerContact}>Jed Van Niekerk 082 419 4464</Text>
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
        <Text style={styles.footerTagline}>{messages.tagline}</Text>
        <Text style={styles.footerAddress}>{messages.address}</Text>
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
