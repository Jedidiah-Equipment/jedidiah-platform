import { PART_UNIT_OF_MEASURE_LABELS, type Supplier } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { Loader2Icon, UploadIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  PART_BULK_IMPORT_COLUMNS,
  type ParsePartBulkImportCsvResult,
  parsePartBulkImportCsv,
} from './part-bulk-import-csv.js';

type BulkImportResult = {
  errors: string[];
  importedCount: number;
  updatedCount: number;
};

type PartBulkImportDialogProps = {
  supplier?: Pick<Supplier, 'companyName' | 'id'>;
};

export const PartBulkImportDialog: React.FC<PartBulkImportDialogProps> = ({ supplier }) => {
  const trpc = useTRPC();
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const [isOpen, setIsOpen] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [parseResult, setParseResult] = useState<ParsePartBulkImportCsvResult>({ errors: [], rows: [] });

  const importMutation = useMutation(
    trpc.parts.bulkImport.mutationOptions({
      onSuccess: async (data) => {
        await invalidateParts();
        setResult(data);
        toast.success(
          data.errors.length > 0 || parseResult.errors.length > 0 ? 'Parts imported with issues' : 'Parts imported',
        );
      },
      onError: (error) => {
        showMutationError(error, 'Unable to import parts.');
      },
    }),
  );

  const resetForm = () => {
    setFile(null);
    setFileInputKey((key) => key + 1);
    setHasHeader(true);
    setParseResult({ errors: [], rows: [] });
    setResult(null);
    importMutation.reset();
  };

  const parseFile = async (nextFile: File, nextHasHeader: boolean) => {
    const text = await nextFile.text();
    setParseResult(parsePartBulkImportCsv(text, { hasHeader: nextHasHeader }));
    setResult(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
  };

  const handleOpenButtonClick = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);

    if (!nextFile) {
      setParseResult({ errors: [], rows: [] });
      setResult(null);
      return;
    }

    void parseFile(nextFile, hasHeader);
  };

  const handleHeaderChange = (checked: boolean) => {
    setHasHeader(checked);

    if (file) {
      void parseFile(file, checked);
    }
  };

  const canImport = file !== null && parseResult.rows.length > 0 && !importMutation.isPending;
  const displayedErrors = result ? [...parseResult.errors, ...result.errors] : parseResult.errors;
  const previewRows = parseResult.rows.slice(0, 10);

  return (
    <>
      <Button onClick={handleOpenButtonClick} variant="outline">
        <UploadIcon data-icon="inline-start" />
        Bulk parts import
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Bulk import parts</DialogTitle>
            <DialogDescription>
              {supplier ? `Import parts for ${supplier.companyName} from a CSV file.` : 'Import parts from a CSV file.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canImport) {
                importMutation.mutate({ rows: parseResult.rows, supplierId: supplier?.id });
              }
            }}
          >
            <Field>
              <FieldLabel htmlFor="parts-import-file">CSV file</FieldLabel>
              <Input
                accept=".csv,text/csv"
                id="parts-import-file"
                key={fileInputKey}
                onChange={handleFileChange}
                type="file"
              />
              <FieldDescription>Expected columns: {PART_BULK_IMPORT_COLUMNS.join(', ')}.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                checked={hasHeader}
                id="parts-import-has-header"
                onCheckedChange={(checked) => handleHeaderChange(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="parts-import-has-header">CSV has header</FieldLabel>
                <FieldDescription>Turn this off when the first row is already part data.</FieldDescription>
              </FieldContent>
            </Field>
            {displayedErrors.length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>{result ? 'Import completed with issues' : 'Import file has row issues'}</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="max-h-40">
                    <ul className="list-disc space-y-1 pl-4 pr-3">
                      {displayedErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            ) : null}
            {parseResult.rows.length > 0 && !result ? (
              <Alert>
                <AlertTitle>Ready to import</AlertTitle>
                <AlertDescription>
                  {parseResult.rows.length} {parseResult.rows.length === 1 ? 'part row' : 'part rows'} ready.
                  {parseResult.errors.length > 0 ? ' Rows with issues will be skipped.' : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {previewRows.length > 0 && !result ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Preview</div>
                <ScrollArea className="h-56 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Internal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow key={`${row.lineNumber}-${row.code}`}>
                          <TableCell>{row.lineNumber}</TableCell>
                          <TableCell>{row.code}</TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>{row.supplierName}</TableCell>
                          <TableCell>{PART_UNIT_OF_MEASURE_LABELS[row.unitOfMeasure]}</TableCell>
                          <TableCell>{row.isInternallyFabricated ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {parseResult.rows.length > previewRows.length ? (
                  <div className="text-xs text-muted-foreground">
                    Showing first {previewRows.length} of {parseResult.rows.length} rows.
                  </div>
                ) : null}
              </div>
            ) : null}
            {result ? (
              <Alert>
                <AlertTitle>
                  {displayedErrors.length > 0 ? 'Import complete with issues' : 'Import complete'}
                </AlertTitle>
                <AlertDescription>
                  Imported {result.importedCount} {result.importedCount === 1 ? 'part' : 'parts'} and updated{' '}
                  {result.updatedCount} {result.updatedCount === 1 ? 'part' : 'parts'}.
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="mt-0" showCloseButton>
              {result ? (
                <Button onClick={resetForm} type="button" variant="link">
                  Import Another
                </Button>
              ) : (
                <Button disabled={!canImport} type="submit">
                  {importMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                  Import parts
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
