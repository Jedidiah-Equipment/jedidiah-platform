import { type QuoteListInput, type QuoteSortBy, QuoteStatus, type QuoteSummary } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, FileTextIcon, PlusIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';
import { formatCurrency } from '@/utils/number.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';

type QuoteStatusFilter = QuoteStatus | 'all';

const statusFilters = ['all', ...QuoteStatus.options] as const satisfies readonly QuoteStatusFilter[];
const sortOptions = [
  'createdAt',
  'code',
  'customerCompanyName',
  'productName',
  'status',
  'total',
] as const satisfies readonly QuoteSortBy[];

export const QuotesPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuoteStatusFilter>('all');
  const [sortBy, setSortBy] = useState<QuoteSortBy>('createdAt');
  const [page, setPage] = useState(1);
  const input = useMemo(
    () =>
      ({
        filters: {
          statuses: status === 'all' ? [] : [status],
        },
        page,
        pageSize: 10,
        search,
        sortBy,
        sortDirection: sortBy === 'createdAt' ? 'desc' : 'asc',
      }) satisfies QuoteListInput,
    [page, search, sortBy, status],
  );
  const quotesQuery = useQuery(
    trpc.quotes.list.queryOptions(input, {
      placeholderData: keepPreviousData,
    }),
  );
  const quotes = quotesQuery.data?.items ?? [];
  const total = quotesQuery.data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / input.pageSize));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Sales</CardDescription>
              <CardTitle>Quotes</CardTitle>
            </div>
            <Button render={<Link to="/quotes/new" />}>
              <PlusIcon data-icon="inline-start" />
              New quote
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <Input
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search quotes..."
              value={search}
            />
            <Select
              onValueChange={(value) => {
                setStatus(value as QuoteStatusFilter);
                setPage(1);
              }}
              value={status}
            >
              <SelectTrigger aria-label="Quote status" className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statusFilters.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All statuses' : quoteStatusLabels[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select onValueChange={(value) => setSortBy(value as QuoteSortBy)} value={sortBy}>
              <SelectTrigger aria-label="Sort quotes" className="w-full">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sortOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {getSortLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {quotesQuery.error ? <p className="text-sm text-destructive">{quotesQuery.error.message}</p> : null}
          <QuoteTable
            isLoading={quotesQuery.isLoading}
            onOpen={(quote) => navigate({ params: { id: quote.id }, to: '/quotes/$id' })}
            quotes={quotes}
          />
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {total} {total === 1 ? 'quote' : 'quotes'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                variant="outline"
              >
                Previous
              </Button>
              <span>
                Page {page} of {maxPage}
              </span>
              <Button
                disabled={page >= maxPage}
                onClick={() => setPage((current) => Math.min(maxPage, current + 1))}
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const QuoteTable: React.FC<{
  isLoading: boolean;
  onOpen: (quote: QuoteSummary) => void;
  quotes: QuoteSummary[];
}> = ({ isLoading, onOpen, quotes }) => {
  if (isLoading) {
    return <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading quotes...</div>;
  }

  if (quotes.length === 0) {
    return <div className="rounded-md border p-6 text-sm text-muted-foreground">No quotes found.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quote</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Valid until</TableHead>
          <TableHead className="w-16 text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((quote) => (
          <TableRow key={quote.id}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                  <FileTextIcon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{quote.code}</div>
                  <p className="text-sm text-muted-foreground">{formatDate(quote.createdAt)}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <QuoteStatusBadge status={quote.status} />
            </TableCell>
            <TableCell>{quote.customerCompanyName}</TableCell>
            <TableCell>
              {quote.productName}
              <span className="ml-2 text-muted-foreground">{quote.productModelCode}</span>
            </TableCell>
            <TableCell>{formatCurrency(quote.total, quote.quotedCurrencyCode ?? quote.productCurrencyCode)}</TableCell>
            <TableCell>{formatDate(quote.validUntil, 'short', 'Not set')}</TableCell>
            <TableCell className="text-right">
              <Button
                aria-label={`Open quote ${quote.code}`}
                onClick={() => onOpen(quote)}
                size="icon-sm"
                variant="outline"
              >
                <ArrowRightIcon />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

function getSortLabel(sortBy: QuoteSortBy): string {
  const labels: Record<QuoteSortBy, string> = {
    code: 'Code',
    createdAt: 'Created',
    customerCompanyName: 'Customer',
    productName: 'Product',
    status: 'Status',
    total: 'Total',
  };

  return labels[sortBy];
}
