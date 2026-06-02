import { PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import { type DocumentSummary, ProductDocumentType } from '@pkg/schema';

export type ProductDocumentTypeGroup = {
  type: ProductDocumentType;
  label: string;
  documents: DocumentSummary[];
};

/**
 * Groups documents by their (frozen) `metadata.type`, in the schema's enum order, omitting empty
 * groups. Job-owned documents carry a frozen copy of the source Product's metadata, so grouping a
 * Job's snapshot reads that frozen type — the same presentation the Product surface uses.
 */
export function groupDocumentsByType(documents: DocumentSummary[]): ProductDocumentTypeGroup[] {
  return ProductDocumentType.options
    .map((type) => ({
      type,
      label: PRODUCT_DOCUMENT_TYPE_LABELS[type],
      documents: documents.filter((document) => getProductDocumentType(document) === type),
    }))
    .filter((group) => group.documents.length > 0);
}

function getProductDocumentType(document: DocumentSummary): ProductDocumentType {
  return ProductDocumentType.parse('type' in document.metadata ? document.metadata.type : undefined);
}
