import {
  type AssertedActorError,
  type BuildError,
  type CheckoutCoreError,
  type CreditNoteCoreError,
  type CustomerCoreError,
  CustomerPossibleMatchError,
  type DocumentCoreError,
  DuplicateDocumentFilenameError,
  type FeedbackCoreError,
  isAssertedActorError,
  isBuildError,
  isCheckoutCoreError,
  isCreditNoteCoreError,
  isCustomerCoreError,
  isDocumentCoreError,
  isFeedbackCoreError,
  isJobCloseOutError,
  isJobCoreError,
  isPartBomError,
  isPartCoreError,
  isProductCoreError,
  isProductRangeCoreError,
  isProductUnitCoreError,
  isProductUnitReassignError,
  isPurchaseOrderCoreError,
  isQuoteCoreError,
  isStockMovementCoreError,
  isStocktakeError,
  isSupplierCoreError,
  isSupplierInvoiceCoreError,
  type JobCloseOutError,
  type JobCoreError,
  type PartBomError,
  type PartCoreError,
  PeriodicStockMovementError,
  type ProductCoreError,
  type ProductRangeCoreError,
  type ProductUnitCoreError,
  type ProductUnitReassignError,
  PurchaseOrderActionRefusedError,
  type PurchaseOrderCoreError,
  type QuoteCoreError,
  type StockMovementCoreError,
  StockMovementPartNotFoundError,
  type StocktakeError,
  type SupplierCoreError,
  type SupplierInvoiceCoreError,
} from '@pkg/core/equipment';
import type { DocumentOwnerType } from '@pkg/schema/equipment';

import { defineCoreErrorFamily } from '../../trpc/errors.js';

/**
 * The Equipment boundary's error families, shared by the tRPC routers and the HTTP routes. A family is
 * declared once here, beside its siblings, so every router that can surface a code maps it the same way.
 */

export const quoteErrorFamily = defineCoreErrorFamily<QuoteCoreError>({
  codes: {
    'quote.allocation_conflict': 'CONFLICT',
    'quote.already_cancelled': 'BAD_REQUEST',
    'quote.cancel_denied': 'FORBIDDEN',
    'quote.cancel_not_an_update': 'BAD_REQUEST',
    'quote.custom_selected_assemblies': 'BAD_REQUEST',
    'quote.delivery_unconfirmed': 'BAD_REQUEST',
    'quote.discount_invalid': 'BAD_REQUEST',
    'quote.document_generation_not_allowed': 'BAD_REQUEST',
    'quote.invalid_reference': 'BAD_REQUEST',
    'quote.locked': 'BAD_REQUEST',
    'quote.not_found': 'NOT_FOUND',
    'quote.offering_invariant': 'BAD_REQUEST',
    'quote.product_bay_availability_not_applicable': 'BAD_REQUEST',
  },
  is: isQuoteCoreError,
  messages: {
    'quote.discount_invalid': 'Quote discount is invalid.',
    'quote.invalid_reference': 'Quote includes an invalid Customer, Product, Product Unit, or salesperson.',
    'quote.not_found': 'Quote not found.',
  },
});

export const productUnitErrorFamily = defineCoreErrorFamily<ProductUnitCoreError>({
  codes: {
    // Removal refused because the machine is still real: the message names which claim holds it.
    'product_unit.in_use': 'CONFLICT',
    'product_unit.not_found': 'NOT_FOUND',
    'product_unit.owner_unchanged': 'BAD_REQUEST',
    'product_unit.product_not_found': 'BAD_REQUEST',
    'product_unit.transfer_backdated': 'BAD_REQUEST',
    'product_unit.transfer_in_future': 'BAD_REQUEST',
  },
  is: isProductUnitCoreError,
  messages: { 'product_unit.not_found': 'Product unit not found.' },
});

/** The rules that only exist between a Unit and the Quote it is moving to. */
export const productUnitReassignErrorFamily = defineCoreErrorFamily<ProductUnitReassignError>({
  codes: {
    'product_unit.reassign_dead_job': 'CONFLICT',
    'product_unit.reassign_displaced_owner': 'CONFLICT',
    'product_unit.reassign_quote_ineligible': 'CONFLICT',
    'product_unit.reassign_unit_ineligible': 'CONFLICT',
  },
  is: isProductUnitReassignError,
});

export const jobErrorFamily = defineCoreErrorFamily<JobCoreError>({
  codes: {
    'job.already_completed': 'BAD_REQUEST',
    'job.bay_already_assigned': 'CONFLICT',
    'job.bay_in_use': 'CONFLICT',
    'job.bay_not_found': 'NOT_FOUND',
    'job.bay_operator_assignment_denied': 'FORBIDDEN',
    'job.bay_operator_assignment_not_found': 'NOT_FOUND',
    'job.bay_operator_not_found': 'NOT_FOUND',
    'job.bay_operator_role_denied': 'BAD_REQUEST',
    'job.cancelled': 'BAD_REQUEST',
    'job.completed_on_in_future': 'BAD_REQUEST',
    'job.create_from_quote_denied': 'FORBIDDEN',
    'job.department_timing_already_completed': 'BAD_REQUEST',
    'job.department_timing_already_started': 'BAD_REQUEST',
    'job.department_timing_invalid': 'BAD_REQUEST',
    'job.department_timing_locked': 'BAD_REQUEST',
    'job.department_timing_not_started': 'BAD_REQUEST',
    'job.not_found': 'NOT_FOUND',
    'job.slot_booking_denied': 'FORBIDDEN',
    'job.slot_not_found': 'NOT_FOUND',
    'job.stock_build_denied': 'BAD_REQUEST',
    // A request the product never offers: only a Stock Build shows the remove-the-unit option.
    'job.unit_removal_denied': 'BAD_REQUEST',
  },
  is: isJobCoreError,
  messages: {
    'job.bay_not_found': 'Job bay not found.',
    'job.bay_operator_assignment_not_found': 'Bay has no current operator assignment.',
    'job.bay_operator_not_found': 'Bay operator not found.',
    'job.not_found': 'Job not found.',
    'job.slot_not_found': 'Job slot not found.',
  },
});

export const productErrorFamily = defineCoreErrorFamily<ProductCoreError>({
  codes: {
    'product.assembly.duplicate_name': 'BAD_REQUEST',
    'product.assembly.duplicate_part': 'BAD_REQUEST',
    'product.assembly.kind_changed': 'BAD_REQUEST',
    'product.assembly.override_target_not_found': 'BAD_REQUEST',
    'product.assembly.override_target_wrong_kind': 'BAD_REQUEST',
    'product.assembly.override_target_wrong_product': 'BAD_REQUEST',
    'product.assembly.wrong_product': 'BAD_REQUEST',
    'product.bay.disabled': 'BAD_REQUEST',
    'product.bay.duplicate': 'BAD_REQUEST',
    'product.bay.not_found': 'NOT_FOUND',
    'product.brochure_incomplete': 'CONFLICT',
    'product.duplicate_model_code': 'CONFLICT',
    'product.duplicate_name': 'CONFLICT',
    'product.material_part.invalid': 'BAD_REQUEST',
    'product.not_found': 'NOT_FOUND',
    'product.range.not_found': 'NOT_FOUND',
    'product.variant.not_found': 'BAD_REQUEST',
  },
  is: isProductCoreError,
  messages: {
    'product.assembly.duplicate_name': 'Assembly names must be unique within a product.',
    'product.assembly.duplicate_part': 'A part can only be added once per assembly.',
    'product.assembly.kind_changed': 'An existing assembly cannot change between standard and optional.',
    'product.assembly.override_target_not_found':
      'Assembly overrides must target standard assemblies on the same product.',
    'product.assembly.override_target_wrong_kind':
      'Assembly overrides must target standard assemblies on the same product.',
    'product.assembly.override_target_wrong_product':
      'Assembly overrides must target standard assemblies on the same product.',
    'product.assembly.wrong_product': 'Assemblies must belong to the product being updated.',
    'product.bay.disabled': 'Only enabled Bays can be added to Product Bays.',
    'product.bay.duplicate': 'A Bay can only be added once per Product.',
    'product.bay.not_found': 'Bay not found.',
    'product.brochure_incomplete': 'Complete the required brochure fields before previewing the brochure.',
    'product.duplicate_model_code': 'A product with this model code already exists.',
    'product.duplicate_name': 'A product with this name already exists.',
    'product.material_part.invalid': 'Product raw materials must use periodic stock tracking.',
    'product.not_found': 'Product not found.',
    'product.range.not_found': 'Product Range not found.',
    'product.variant.not_found': 'Product Range Variant not found for this Product Range.',
  },
});

/** What an owner is called in a message to a person, as against its `owner_type` column value. */
const DOCUMENT_OWNER_NOUNS = {
  job: 'Job',
  product: 'Product',
  purchase_order: 'Purchase Order',
  quote: 'Quote',
} as const satisfies Record<DocumentOwnerType, string>;

export const documentErrorFamily = defineCoreErrorFamily<DocumentCoreError>({
  codes: {
    'document.content_type_not_allowed': 'BAD_REQUEST',
    'document.delete_not_allowed': 'BAD_REQUEST',
    'document.duplicate_filename': 'CONFLICT',
    'document.file_too_large': 'BAD_REQUEST',
    'document.metadata_invalid': 'BAD_REQUEST',
    'document.not_found': 'NOT_FOUND',
    'document.storage_key_conflict': 'BAD_REQUEST',
  },
  is: isDocumentCoreError,
  messages: {
    'document.duplicate_filename': (error) =>
      error instanceof DuplicateDocumentFilenameError
        ? `A document with this filename already exists for this ${DOCUMENT_OWNER_NOUNS[error.metadata.ownerType]}.`
        : error.message,
    'document.not_found': 'Document not found.',
  },
});

export const feedbackErrorFamily = defineCoreErrorFamily<FeedbackCoreError>({
  codes: {
    'feedback.not_found': 'NOT_FOUND',
    'feedback.subject_not_found': 'NOT_FOUND',
  },
  is: isFeedbackCoreError,
  messages: {
    'feedback.not_found': 'The feedback item could not be found.',
    'feedback.subject_not_found': 'The Quote, Job or Purchase Order this feedback is about could not be found.',
  },
});

export const productRangeErrorFamily = defineCoreErrorFamily<ProductRangeCoreError>({
  codes: {
    'product_range.duplicate_name': 'CONFLICT',
    'product_range.has_products': 'CONFLICT',
    'product_range.not_found': 'NOT_FOUND',
    'product_range.variant_duplicate_name': 'CONFLICT',
    'product_range.variant_has_products': 'CONFLICT',
    'product_range.variant_not_found': 'NOT_FOUND',
  },
  is: isProductRangeCoreError,
  messages: {
    'product_range.duplicate_name': 'A Product Range with this name already exists.',
    'product_range.has_products': 'Product Range has active linked products and cannot be removed.',
    'product_range.not_found': 'Product Range not found.',
    'product_range.variant_duplicate_name': 'A Variant with this name already exists for this Product Range.',
    'product_range.variant_has_products': 'Product Range Variant has active linked products and cannot be removed.',
    'product_range.variant_not_found': 'Product Range Variant not found.',
  },
});

export const supplierErrorFamily = defineCoreErrorFamily<SupplierCoreError>({
  codes: {
    'supplier.duplicate_name': 'CONFLICT',
    'supplier.has_draft_purchase_orders': 'CONFLICT',
    'supplier.merge_self': 'BAD_REQUEST',
    'supplier.not_found': 'NOT_FOUND',
  },
  is: isSupplierCoreError,
  messages: {
    'supplier.duplicate_name': 'A supplier with this name already exists.',
    'supplier.has_draft_purchase_orders':
      'This supplier cannot be removed while it has Purchase Orders that have not been sent.',
    'supplier.merge_self': 'A supplier cannot be merged into itself.',
    'supplier.not_found': 'Supplier not found.',
  },
});

export const customerErrorFamily = defineCoreErrorFamily<CustomerCoreError>({
  codes: {
    'customer.in_use': 'CONFLICT',
    'customer.merge_busy': 'CONFLICT',
    'customer.merge_self': 'BAD_REQUEST',
    'customer.not_found': 'NOT_FOUND',
    'customer.possible_match': 'CONFLICT',
  },
  is: isCustomerCoreError,
  messages: {
    'customer.in_use': 'This customer cannot be removed because another record still references it.',
    'customer.merge_busy':
      'Another change is still using this customer or its records. Wait a moment and try merging again.',
    'customer.merge_self': 'A customer cannot be merged into itself.',
    'customer.not_found': 'Customer not found.',
  },
  // The candidates the caller picks from instead of creating a duplicate.
  metadata: (error) => (error instanceof CustomerPossibleMatchError ? error.metadata : undefined),
});

/**
 * The Part boundary's two families. A build reaches for Parts and their BOMs too, and the inventory
 * boundary must surface those failures with the same codes and the same words — one table, both routers.
 */

export const partBomErrorFamily = defineCoreErrorFamily<PartBomError>({
  codes: {
    'part.bom_component_not_found': 'NOT_FOUND',
    'part.bom_cycle': 'BAD_REQUEST',
    'part.bom_quantity': 'BAD_REQUEST',
    'part.not_built': 'BAD_REQUEST',
  },
  is: isPartBomError,
});

export const partCoreErrorFamily = defineCoreErrorFamily<PartCoreError>({
  codes: {
    'part.bom_locked': 'CONFLICT',
    'part.bulk_import_conflict': 'CONFLICT',
    'part.category_merge_self': 'BAD_REQUEST',
    'part.category_name_taken': 'CONFLICT',
    'part.category_not_found': 'NOT_FOUND',
    'part.duplicate_code': 'CONFLICT',
    'part.import_batch_not_found': 'NOT_FOUND',
    'part.label_selection_empty': 'NOT_FOUND',
    'part.merge_blocked': 'CONFLICT',
    'part.merge_self': 'BAD_REQUEST',
    'part.not_found': 'NOT_FOUND',
    'part.supplier_locked_by_purchase_order': 'CONFLICT',
    'part.supplier_not_found': 'NOT_FOUND',
    'part.unit_of_measure_locked': 'CONFLICT',
  },
  is: isPartCoreError,
  // Only where the core error's own wording is too internal to show a user.
  messages: {
    'part.bulk_import_conflict': 'A CSV row matches an existing part code with a different supplier.',
    'part.category_name_taken': 'A Part Category with this name already exists.',
    'part.category_not_found': 'Part Category not found.',
    'part.duplicate_code': 'A part with this code already exists.',
    'part.import_batch_not_found': 'Part import not found.',
    'part.label_selection_empty': 'No Parts match this label selection.',
    'part.merge_blocked': 'These Parts cannot be merged yet. Review the merge preview for what to fix first.',
    'part.not_found': 'Part not found.',
    'part.supplier_locked_by_purchase_order': 'Supplier cannot change after the Part is used on a Purchase Order.',
    'part.supplier_not_found': 'Supplier not found.',
    'part.unit_of_measure_locked': 'Unit of Measure cannot change after the Part ledger starts.',
  },
});

/** Every Purchase Order failure already carries a public message; only the shape differs. */
export const purchaseOrderErrorFamily = defineCoreErrorFamily<PurchaseOrderCoreError>({
  codes: {
    'purchase_order.arrival_below_zero': 'BAD_REQUEST',
    'purchase_order.already_cancelled': 'BAD_REQUEST',
    'purchase_order.already_closed_short': 'BAD_REQUEST',
    'purchase_order.already_sent': 'BAD_REQUEST',
    'purchase_order.amendment_below_received': 'BAD_REQUEST',
    'purchase_order.amendment_line_has_arrivals': 'CONFLICT',
    'purchase_order.amendment_last_line': 'BAD_REQUEST',
    'purchase_order.closed_short': 'BAD_REQUEST',
    'purchase_order.empty': 'BAD_REQUEST',
    'purchase_order.fully_received': 'BAD_REQUEST',
    'purchase_order.has_receipts': 'BAD_REQUEST',
    'purchase_order.invalid_quantity': 'BAD_REQUEST',
    'purchase_order.line_exists': 'CONFLICT',
    'purchase_order.line_id_conflict': 'CONFLICT',
    'purchase_order.line_not_found': 'NOT_FOUND',
    'purchase_order.line_not_custom': 'BAD_REQUEST',
    'purchase_order.line_not_priced': 'BAD_REQUEST',
    'purchase_order.no_receipts': 'BAD_REQUEST',
    'purchase_order.not_approved': 'BAD_REQUEST',
    'purchase_order.not_draft': 'BAD_REQUEST',
    'purchase_order.not_found': 'NOT_FOUND',
    'purchase_order.not_sent': 'BAD_REQUEST',
    'purchase_order.part_not_found': 'NOT_FOUND',
    'purchase_order.part_not_purchasable': 'BAD_REQUEST',
    'purchase_order.part_supplier_mismatch': 'BAD_REQUEST',
    'purchase_order.substitution_has_receipts': 'CONFLICT',
    'purchase_order.supplier_not_found': 'NOT_FOUND',
  },
  is: isPurchaseOrderCoreError,
  // Which Purchase Order Action a state refusal refused, and why — the served verdict's own words.
  metadata: (error) =>
    error instanceof PurchaseOrderActionRefusedError ? { action: error.action, reason: error.reason } : undefined,
});

/** A credit note fails on the returns it claims, never on the document itself. */
export const creditNoteErrorFamily = defineCoreErrorFamily<CreditNoteCoreError>({
  codes: {
    'credit_note.already_settled': 'CONFLICT',
    'credit_note.return_not_found': 'NOT_FOUND',
  },
  is: isCreditNoteCoreError,
});

/**
 * The invoice panel fails on the flag being acted on, never on the extraction. An unreadable
 * invoice is a state the panel reports, not an error a procedure raises (spec §5).
 */
export const supplierInvoiceErrorFamily = defineCoreErrorFamily<SupplierInvoiceCoreError>({
  codes: {
    'invoice.flag_already_resolved': 'CONFLICT',
    'invoice.flag_not_found': 'NOT_FOUND',
    'invoice.not_found': 'NOT_FOUND',
    'invoice.price_not_applicable': 'BAD_REQUEST',
  },
  is: isSupplierInvoiceCoreError,
});

/**
 * The inventory boundary's error families. Each procedure names only the families it can actually
 * raise — a stock read cannot fail as a build, and a build has no Job to cancel — so the list at a
 * call site doubles as documentation of what that endpoint touches.
 */

/** The ledger's own rules, shared by every router that writes a movement. */
export const stockMovementErrorFamily = defineCoreErrorFamily<StockMovementCoreError>({
  codes: {
    'inventory.fabricated_part_cost': 'BAD_REQUEST',
    'inventory.invalid_delta': 'BAD_REQUEST',
    'inventory.invalid_length': 'BAD_REQUEST',
    'inventory.part_code_not_found': 'NOT_FOUND',
    'inventory.part_not_found': 'NOT_FOUND',
    'inventory.periodic_movement': 'BAD_REQUEST',
  },
  is: isStockMovementCoreError,
  messages: {
    'inventory.part_code_not_found': 'No Part carries that code. Search for it by name instead.',
    'inventory.part_not_found': 'Part not found.',
  },
  metadata: (error) => {
    if (error instanceof StockMovementPartNotFoundError) return { partId: error.metadata.partId };
    if (error instanceof PeriodicStockMovementError && error.metadata.partId) return { partId: error.metadata.partId };
    return undefined;
  },
});

/**
 * The stores tablet failing to name a person the ledger may attribute a movement to — including
 * naming nobody at all from a shared device. All read as a bad request rather than a forbidden: the
 * caller's own right to post is intact, it is the name on the movement that is wrong or missing.
 */
export const assertedActorErrorFamily = defineCoreErrorFamily<AssertedActorError>({
  codes: {
    'inventory.actor_disabled': 'BAD_REQUEST',
    'inventory.actor_is_device': 'BAD_REQUEST',
    'inventory.actor_not_found': 'BAD_REQUEST',
    'inventory.actor_required': 'BAD_REQUEST',
  },
  is: isAssertedActorError,
  messages: {
    'inventory.actor_disabled': 'That person’s account is disabled. Ask the office to re-enable it.',
    'inventory.actor_is_device': 'A shared device cannot be the person who moved the stock.',
    'inventory.actor_not_found': 'That badge is not recognised. Pick a name from the list instead.',
    'inventory.actor_required': 'Choose who is at the tablet before moving any stock.',
  },
});

export const checkoutErrorFamily = defineCoreErrorFamily<CheckoutCoreError>({
  codes: {
    'inventory.invalid_source_checkout': 'BAD_REQUEST',
    'inventory.quote_not_found': 'NOT_FOUND',
    'inventory.quote_not_open': 'BAD_REQUEST',
    'inventory.quote_not_parts_sale': 'BAD_REQUEST',
    'inventory.recipient_ineligible': 'BAD_REQUEST',
  },
  is: isCheckoutCoreError,
  messages: {
    'inventory.invalid_source_checkout': 'Select a Checkout without a Job.',
    'inventory.quote_not_found': 'Select a Parts Sale.',
    'inventory.quote_not_open': 'This Parts Sale was rejected or cancelled and can no longer draw stock.',
    'inventory.quote_not_parts_sale':
      "Stock can only be checked out to a Parts Sale. Check this Quote's parts out to its Job.",
    'inventory.recipient_ineligible': 'Select an active Equipment user who is not a device.',
  },
});

export const buildErrorFamily = defineCoreErrorFamily<BuildError>({
  codes: {
    'inventory.build_component_not_found': 'NOT_FOUND',
    'inventory.build_linear_part': 'BAD_REQUEST',
    'inventory.build_periodic_part': 'BAD_REQUEST',
    'inventory.build_self_component': 'BAD_REQUEST',
  },
  is: isBuildError,
});

export const jobCloseOutErrorFamily = defineCoreErrorFamily<JobCloseOutError>({
  codes: {
    'inventory.job_already_closed_out': 'BAD_REQUEST',
    'inventory.job_closed_out': 'BAD_REQUEST',
    'inventory.job_not_completed': 'BAD_REQUEST',
  },
  is: isJobCloseOutError,
});

/**
 * The counting walk's own rules. Out-of-scope is a bad request rather than a forbidden: the caller
 * may count, they are just standing in the wrong walk for that shelf.
 */
export const stocktakeErrorFamily = defineCoreErrorFamily<StocktakeError>({
  codes: {
    'inventory.stocktake_part_out_of_scope': 'BAD_REQUEST',
    'inventory.stocktake_session_already_open': 'BAD_REQUEST',
    'inventory.stocktake_session_closed': 'BAD_REQUEST',
    'inventory.stocktake_session_not_found': 'NOT_FOUND',
    'inventory.stocktake_uncounted_bucket': 'BAD_REQUEST',
  },
  is: isStocktakeError,
});
