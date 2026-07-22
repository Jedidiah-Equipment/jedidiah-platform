import {
  documentContentTypeLabel,
  formatBytes,
  formatCurrency,
  formatDate,
  isBrochureReady,
  isLanderReady,
} from '@pkg/domain';
import type { OptionalAssembly, Product, ProductDocument, StandardAssembly } from '@pkg/schema';
import { IconCheck, IconChevronLeft, IconDownload, IconEye, IconLink } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { ProductImage } from '@/components/products/ProductImage';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useDocumentDownload } from '@/hooks/use-document-download';
import { landerOrigin } from '@/lib/app-env';
import { productBrochurePreviewPath, productDocumentDownloadPath } from '@/lib/authed-fetch';
import { getDocumentListAction } from '@/lib/document-content';
import { PRODUCT_BROCHURE_DOCUMENT_ID, productBrochureFilename } from '@/lib/product-brochure';
import { landerProductUrls } from '@/lib/product-presentation';
import { useTRPC } from '@/lib/trpc';

export function ProductDetail({ product, onBack }: { product: Product; onBack: () => void }) {
  return (
    <View className="flex-1 bg-background">
      <ProductDetailHeader onBack={onBack} product={product} />
      <ScrollView contentContainerClassName="mx-auto w-full max-w-[720px] gap-4 px-4 pb-8 pt-4">
        <ProductIdentity product={product} />
        <ProductDetailsCard product={product} />
        <ProductAssembliesCard product={product} />
        <ProductDocumentsCard product={product} />
      </ScrollView>
    </View>
  );
}

function ProductDetailHeader({ product, onBack }: { product: Product; onBack: () => void }) {
  return (
    <View className="border-b border-border bg-background">
      <View className="mx-auto h-16 w-full max-w-[720px] flex-row items-center gap-2 px-4">
        <HeaderButton icon={IconChevronLeft} label="Back to Products" onPress={onBack} />
        <View className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-image-backdrop">
          <ProductImage product={product} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[17px] leading-5 text-foreground" numberOfLines={1} weight="bold">
            {product.name}
          </Text>
          <Text className="mt-0.5 text-[11px] text-muted-foreground" mono numberOfLines={1}>
            {product.modelCode}
          </Text>
        </View>
        <ProfileMenuButton />
      </View>
    </View>
  );
}

function HeaderButton({ icon, label, onPress }: { icon: typeof IconChevronLeft; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
      onPress={onPress}
    >
      <Icon icon={icon} size={20} />
    </Pressable>
  );
}

function ProductIdentity({ product }: { product: Product }) {
  return (
    <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
      <View className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-image-backdrop">
        <ProductImage product={product} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-lg leading-6 text-surface-foreground" numberOfLines={2} weight="bold">
          {product.name}
        </Text>
        <Text className="mt-1 text-[11px] text-muted-foreground" mono numberOfLines={1}>
          {[product.modelCode, product.variant?.name].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function ProductDetailsCard({ product }: { product: Product }) {
  const urls = landerProductUrls(landerOrigin, product.modelCode);
  const published = isLanderReady(product);
  const showToast = useAppToast();
  const [copied, setCopied] = useState<'en' | 'af' | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyLink = async (locale: 'en' | 'af') => {
    if (!published) {
      showToast('error', 'Product is not yet enabled on the website');
      return;
    }

    try {
      await Clipboard.setStringAsync(urls[locale]);
      setCopied(locale);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2_000);
    } catch {
      Alert.alert('Couldn’t copy link', 'Please try again.');
    }
  };

  return (
    <SectionCard title="DETAILS">
      <View className="flex-row flex-wrap gap-x-4 gap-y-4">
        <DetailFact label="RANGE" value={product.range.name} />
        {product.variant ? <DetailFact label="RANGE VARIANT" value={product.variant.name} /> : null}
        <DetailFact label="MODEL CODE" value={product.modelCode} mono />
        {product.category ? <DetailFact label="CATEGORY" value={product.category} /> : null}
        <View className="w-full">
          <FactLabel>BASE PRICE</FactLabel>
          <Text className="mt-1 text-xl text-primary" weight="bold">
            {formatCurrency(product.basePrice, product.currencyCode)}
          </Text>
        </View>
        <View className="w-full">
          <FactLabel>WEBSITE LINK</FactLabel>
          <View className="mt-2 gap-2">
            <WebsiteLinkRow
              copied={copied === 'en'}
              label="EN"
              onPress={() => void copyLink('en')}
              published={published}
              url={urls.en}
            />
            <WebsiteLinkRow
              copied={copied === 'af'}
              label="AF"
              onPress={() => void copyLink('af')}
              published={published}
              url={urls.af}
            />
          </View>
        </View>
        {product.description ? (
          <View className="w-full">
            <FactLabel>DESCRIPTION</FactLabel>
            <Text className="mt-1.5 text-sm leading-6 text-muted-foreground">{product.description}</Text>
          </View>
        ) : null}
      </View>
    </SectionCard>
  );
}

function DetailFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="min-w-[140px] flex-1 basis-[45%]">
      <FactLabel>{label}</FactLabel>
      <Text className="mt-1 text-sm text-surface-foreground" mono={mono} weight="semibold">
        {value}
      </Text>
    </View>
  );
}

function FactLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10px] uppercase tracking-wide text-muted-foreground" mono>
      {children}
    </Text>
  );
}

function WebsiteLinkRow({
  label,
  url,
  published,
  copied,
  onPress,
}: {
  label: string;
  url: string;
  published: boolean;
  copied: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={published ? 'Copies this link' : 'Explains why this link is unavailable'}
      accessibilityLabel={`${label} website link${published ? '' : ', unavailable'}`}
      accessibilityRole="button"
      className={`h-11 flex-row items-center gap-2.5 rounded-xl border border-border bg-background px-3 active:bg-muted ${published ? '' : 'opacity-40'}`}
      onPress={onPress}
    >
      <View className="rounded-md border border-border bg-muted px-1.5 py-1">
        <Text className="text-[9px] tracking-wide text-muted-foreground" mono weight="semibold">
          {label}
        </Text>
      </View>
      <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" mono numberOfLines={1}>
        {url}
      </Text>
      <View className="flex-row items-center gap-1">
        <Icon className={copied ? 'text-status-next' : 'text-primary'} icon={copied ? IconCheck : IconLink} size={14} />
        <Text
          className={`text-[9px] tracking-wide ${copied ? 'text-status-next' : 'text-primary'}`}
          mono
          weight="semibold"
        >
          {copied ? 'COPIED' : 'COPY'}
        </Text>
      </View>
    </Pressable>
  );
}

function ProductAssembliesCard({ product }: { product: Product }) {
  const optional = product.assemblies.filter((assembly): assembly is OptionalAssembly => assembly.kind === 'optional');
  const standard = product.assemblies.filter((assembly): assembly is StandardAssembly => assembly.kind === 'standard');

  return (
    <SectionCard title={`ASSEMBLIES · ${product.assemblies.length}`}>
      {optional.length > 0 ? (
        <AssemblyGroup
          assemblies={optional}
          kind="optional"
          renderPrice={(assembly) => formatPriceDelta(assembly.price, product.currencyCode)}
          title="OPTIONAL ASSEMBLIES"
        />
      ) : null}
      {standard.length > 0 ? (
        <View className={optional.length > 0 ? 'mt-4' : ''}>
          <AssemblyGroup assemblies={standard} kind="standard" title="STANDARD ASSEMBLIES" />
        </View>
      ) : null}
      {product.assemblies.length === 0 ? (
        <Text className="text-sm text-muted-foreground">No Assemblies for this Product.</Text>
      ) : null}
    </SectionCard>
  );
}

function AssemblyGroup<T extends OptionalAssembly | StandardAssembly>({
  assemblies,
  kind,
  title,
  renderPrice,
}: {
  assemblies: readonly T[];
  kind: 'optional' | 'standard';
  title: string;
  renderPrice?: (assembly: T) => string;
}) {
  return (
    <View>
      <Text className={`pb-2 leading-6 ${kind === 'optional' ? 'text-primary' : 'text-muted-foreground'}`} mono>
        {title}
      </Text>
      {assemblies.map((assembly) => (
        <View className="flex-row items-center gap-3 border-t border-border py-3" key={assembly.id}>
          <View className={`h-2 w-2 rounded-full ${kind === 'optional' ? 'bg-primary' : 'bg-muted-foreground'}`} />
          <Text className="min-w-0 flex-1 text-sm text-surface-foreground" weight="semibold">
            {assembly.name}
          </Text>
          {renderPrice ? (
            <Text className="text-[11px] text-primary" mono weight="semibold">
              {renderPrice(assembly)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function formatPriceDelta(price: number, currencyCode: string): string {
  const sign = price > 0 ? '+' : price < 0 ? '−' : '';

  return `${sign}${formatCurrency(Math.abs(price), currencyCode)}`;
}

function ProductDocumentsCard({ product }: { product: Product }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.documents.listByProduct.queryOptions({ productId: product.id }));
  const brochureReady = isBrochureReady(product);
  const documentCount = (query.data?.length ?? 0) + Number(brochureReady);

  return (
    <SectionCard title={query.isSuccess ? `DOCS · ${documentCount}` : 'DOCS'}>
      {brochureReady ? <ProductBrochureRow product={product} /> : null}
      {query.isPending ? (
        <Text className="text-sm text-muted-foreground">Loading documents…</Text>
      ) : query.isError ? (
        <Text className="text-sm text-danger">Couldn’t load documents.</Text>
      ) : query.data.length === 0 && !brochureReady ? (
        <Text className="text-sm text-muted-foreground">No documents for this Product.</Text>
      ) : (
        query.data.map((document) => <ProductDocumentRow document={document} key={document.id} product={product} />)
      )}
    </SectionCard>
  );
}

function ProductBrochureRow({ product }: { product: Product }) {
  const router = useRouter();
  const filename = productBrochureFilename(product.modelCode);
  const open = () =>
    router.push({
      pathname: '/documents/[documentId]',
      params: { documentId: PRODUCT_BROCHURE_DOCUMENT_ID, productId: product.id },
    });

  return (
    <ProductFileRow
      contentType="application/pdf"
      downloadPath={productBrochurePreviewPath(product.id)}
      filename={filename}
      metadata="Generated Product Brochure"
      onOpen={open}
    />
  );
}

function ProductDocumentRow({ document, product }: { document: ProductDocument; product: Product }) {
  const router = useRouter();
  const open = () =>
    router.push({
      pathname: '/documents/[documentId]',
      params: { documentId: document.id, productId: product.id },
    });

  return (
    <ProductFileRow
      contentType={document.contentType}
      downloadPath={productDocumentDownloadPath(product.id, document.id)}
      filename={document.filename}
      metadata={`${formatBytes(document.byteSize)} · ${formatDate(document.createdAt, 'd MMM yyyy')}`}
      onOpen={getDocumentListAction(document.contentType) === 'preview' ? open : undefined}
    />
  );
}

function ProductFileRow({
  contentType,
  downloadPath,
  filename,
  metadata,
  onOpen,
}: {
  contentType: string;
  downloadPath: string;
  filename: string;
  metadata: string;
  onOpen?: () => void;
}) {
  const { download, isDownloading } = useDocumentDownload({ contentType, filename, path: downloadPath });
  const details = (
    <>
      <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
        {filename}
      </Text>
      <Text className="mt-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
        {metadata}
      </Text>
    </>
  );

  return (
    <View className="flex-row items-center gap-2 border-t border-border py-3">
      <View className="h-10 w-10 items-center justify-center rounded-lg border border-danger/25 bg-danger/10">
        <Text className="text-[9px] text-danger" mono weight="semibold">
          {documentContentTypeLabel(contentType)}
        </Text>
      </View>
      {onOpen ? (
        <Pressable
          accessibilityHint="Opens the document viewer"
          accessibilityLabel={filename}
          accessibilityRole="button"
          className="min-w-0 flex-1"
          onPress={onOpen}
        >
          {details}
        </Pressable>
      ) : (
        <View className="min-w-0 flex-1">{details}</View>
      )}
      {onOpen ? <DocumentButton icon={IconEye} label="Open document" onPress={onOpen} /> : null}
      <DocumentButton
        busy={isDownloading}
        icon={IconDownload}
        label="Download document"
        onPress={() => void download()}
      />
    </View>
  );
}

function DocumentButton({
  icon,
  label,
  onPress,
  busy = false,
}: {
  icon: typeof IconEye;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted active:opacity-70"
      disabled={busy}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator size="small" /> : <Icon className="text-muted-foreground" icon={icon} size={17} />}
    </Pressable>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground" mono weight="semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}
