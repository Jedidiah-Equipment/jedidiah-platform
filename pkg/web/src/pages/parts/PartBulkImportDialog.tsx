import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  PART_BULK_IMPORT_COLUMNS,
  type ParsePartBulkImportCsvResult,
  parsePartBulkImportCsv,
} from './part-bulk-import-csv.js';

type BulkImportResult = {
  importedCount: number;
  updatedCount: number;
};

export const PartBulkImportDialog: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [parseResult, setParseResult] = useState<ParsePartBulkImportCsvResult>({ errors: [], rows: [] });
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const importMutation = useMutation(
    trpc.parts.bulkImport.mutationOptions({
      onSuccess: async (data) => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.parts.list.queryFilter()),
          queryClient.invalidateQueries(trpc.parts.categories.queryFilter()),
        ]);
        setResult(data);
        toast.success('Parts imported');
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

  const canImport =
    file !== null && parseResult.rows.length > 0 && parseResult.errors.length === 0 && !importMutation.isPending;

  return (
    <>
      <Button onClick={handleOpenButtonClick} variant="outline">
        <UploadIcon data-icon="inline-start" />
        Bulk import
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Bulk import parts</DialogTitle>
            <DialogDescription>Import parts from a CSV file.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canImport) {
                importMutation.mutate({ rows: parseResult.rows });
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
            {parseResult.errors.length > 0 ? (
              <Alert variant="destructive">
                <AlertTitle>Import file needs changes</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
                    {parseResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {parseResult.rows.length > 0 && !result ? (
              <Alert>
                <AlertTitle>Ready to import</AlertTitle>
                <AlertDescription>
                  {parseResult.rows.length} {parseResult.rows.length === 1 ? 'part row' : 'part rows'} parsed.
                </AlertDescription>
              </Alert>
            ) : null}
            {result ? (
              <Alert>
                <AlertTitle>Import complete</AlertTitle>
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
