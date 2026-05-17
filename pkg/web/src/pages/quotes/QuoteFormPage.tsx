import type { QuoteCreateInput, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatCurrency } from '@/utils/number.js';

type QuoteFormPageProps = {
  quoteId?: UUID;
};

type CustomerMode = 'existing' | 'inline';

export const QuoteFormPage: React.FC<QuoteFormPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isEditing = Boolean(quoteId);
  const quoteQuery = useQuery({
    ...trpc.quotes.get.queryOptions({ id: quoteId ?? '' }),
    enabled: Boolean(quoteId),
  });
  const customersQuery = useQuery(
    trpc.quotes.customers.queryOptions({
      columnFilters: {},
      page: 1,
      pageSize: 100,
      search: '',
      sortBy: 'companyName',
      sortDirection: 'asc',
    }),
  );
  const productsQuery = useQuery(
    trpc.quotes.products.queryOptions({
      columnFilters: {},
      page: 1,
      pageSize: 100,
      search: '',
      sortBy: 'name',
      sortDirection: 'asc',
    }),
  );
  const salespeopleQuery = useQuery(trpc.quotes.salespeople.queryOptions());
  const quote = quoteQuery.data;
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [customerId, setCustomerId] = useState('');
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [productId, setProductId] = useState('');
  const [salesPersonId, setSalesPersonId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const selectedProduct = productsQuery.data?.items.find((product) => product.id === productId);
  const discountNumber = Number(discount || 0);
  const total = selectedProduct ? selectedProduct.basePrice - discountNumber : null;
  const isFrozen = quote?.status !== undefined && quote.status !== 'draft';

  useEffect(() => {
    if (!quote) return;

    setCustomerMode('existing');
    setCustomerId(quote.customerId);
    setProductId(quote.productId);
    setSalesPersonId(quote.salesPersonId ?? '');
    setDiscount(String(quote.discount));
    setValidUntil(quote.validUntil ?? '');
    setNotes(quote.notes ?? '');
  }, [quote]);

  const createMutation = useMutation(
    trpc.quotes.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.quotes.list.queryFilter());
        toast.success('Quote created');
        await navigate({ params: { id: created.id }, to: '/quotes/$id' });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const updateMutation = useMutation(
    trpc.quotes.update.mutationOptions({
      onSuccess: async (updated) => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.quotes.get.queryFilter({ id: updated.id })),
          queryClient.invalidateQueries(trpc.quotes.list.queryFilter()),
        ]);
        toast.success('Quote updated');
        await navigate({ params: { id: updated.id }, to: '/quotes/$id' });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const isPending = createMutation.isPending || updateMutation.isPending;
  const input = useMemo<QuoteCreateInput>(
    () => ({
      customer:
        customerMode === 'existing'
          ? {
              type: 'existing',
              customerId,
            }
          : {
              type: 'inline',
              companyName: inlineCompanyName,
            },
      discount: discountNumber,
      notes,
      productId,
      salesPersonId,
      validUntil: validUntil || null,
    }),
    [customerId, customerMode, discountNumber, inlineCompanyName, notes, productId, salesPersonId, validUntil],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isEditing && quoteId) {
      updateMutation.mutate({ ...input, id: quoteId });
      return;
    }

    createMutation.mutate(input);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        {quoteId ? (
          <Button render={<Link params={{ id: quoteId }} to="/quotes/$id" />} variant="ghost">
            <ArrowLeftIcon data-icon="inline-start" />
            Quote
          </Button>
        ) : (
          <Button render={<Link to="/quotes" />} variant="ghost">
            <ArrowLeftIcon data-icon="inline-start" />
            Quotes
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Sales</CardDescription>
          <CardTitle>{isEditing ? 'Edit quote' : 'New quote'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Separator className="mb-4" />
          {quoteQuery.error ? <p className="mb-4 text-sm text-destructive">{quoteQuery.error.message}</p> : null}
          {isFrozen ? (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Sent quotes are read-only. Create a new draft quote for revised terms.
            </div>
          ) : null}
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="customer-mode">Customer</Label>
                <Select onValueChange={(value) => setCustomerMode(value as CustomerMode)} value={customerMode}>
                  <SelectTrigger id="customer-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="existing">Existing customer</SelectItem>
                      <SelectItem value="inline">New company name</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {customerMode === 'existing' ? (
                <div className="grid gap-2">
                  <Label htmlFor="customer-id">Existing customer</Label>
                  <Select disabled={isFrozen} onValueChange={(value) => setCustomerId(value ?? '')} value={customerId}>
                    <SelectTrigger id="customer-id" className="w-full">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(customersQuery.data?.items ?? []).map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.companyName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="inline-company">Company name</Label>
                  <Input
                    disabled={isFrozen}
                    id="inline-company"
                    onChange={(event) => setInlineCompanyName(event.target.value)}
                    value={inlineCompanyName}
                  />
                </div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="product-id">Product</Label>
                <Select disabled={isFrozen} onValueChange={(value) => setProductId(value ?? '')} value={productId}>
                  <SelectTrigger id="product-id" className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(productsQuery.data?.items ?? []).map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} · {product.modelCode}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salesperson-id">Salesperson</Label>
                <Select
                  disabled={isFrozen}
                  onValueChange={(value) => setSalesPersonId(value ?? '')}
                  value={salesPersonId}
                >
                  <SelectTrigger id="salesperson-id" className="w-full">
                    <SelectValue placeholder="Select salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(salespeopleQuery.data?.users ?? []).map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} · {person.email}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="discount">Discount</Label>
                <Input
                  disabled={isFrozen}
                  id="discount"
                  min="0"
                  onChange={(event) => setDiscount(event.target.value)}
                  step="0.01"
                  type="number"
                  value={discount}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valid-until">Valid until</Label>
                <Input
                  disabled={isFrozen}
                  id="valid-until"
                  onChange={(event) => setValidUntil(event.target.value)}
                  type="date"
                  value={validUntil}
                />
              </div>
              <div className="grid gap-1 rounded-md border p-3 text-sm">
                <span className="text-muted-foreground">Quote total</span>
                <span className="font-medium">
                  {total === null ? 'Select a product' : `R ${formatCurrency(total)}`}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                disabled={isFrozen}
                id="notes"
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                value={notes}
              />
            </div>
            <div className="flex justify-end">
              <Button disabled={isPending || isFrozen} type="submit">
                {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                {isEditing ? 'Save quote' : 'Create quote'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
