import { validateDocumentPolicy } from '@pkg/domain/equipment';
import type { DocumentOwnerType } from '@pkg/schema/equipment';
import { IconLoader2, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { DocumentFileField } from './DocumentFileField.js';

export function DocumentUploadForm({
  isPending,
  label,
  onFileChange,
  onSubmit,
  onTypeChange,
  ownerType,
  selectedFile,
  selectedType,
  typeOptions,
}: {
  isPending: boolean;
  label: string;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  onTypeChange: (type: string | null) => void;
  ownerType: DocumentOwnerType;
  selectedFile: File | null;
  selectedType: string | null;
  typeOptions: readonly { label: string; value: string }[];
}) {
  const [error, setError] = useState('');
  const [typeError, setTypeError] = useState('');
  return (
    <form
      className="grid w-full min-w-0 gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (isPending) return;
        const validation = selectedFile
          ? validateDocumentPolicy({
              byteSize: selectedFile.size,
              contentType:
                selectedFile.type || (selectedFile.name.toLowerCase().endsWith('.zip') ? 'application/zip' : ''),
              metadata: { type: selectedType },
              ownerType,
            })
          : null;
        setError(
          !selectedFile ? 'Choose a document to upload.' : validation && !validation.ok ? validation.message : '',
        );
        setTypeError(selectedType ? '' : 'Choose a document type.');
        if (selectedFile && selectedType && validation?.ok) onSubmit();
      }}
    >
      <DocumentFileField
        error={error}
        file={selectedFile}
        label={label}
        onChange={onFileChange}
        onError={setError}
        ownerType={ownerType}
        pending={isPending}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-0 flex-1">
          <FieldLabel className="text-xs">Document type</FieldLabel>
          <Select
            disabled={isPending}
            onValueChange={(value) => {
              setTypeError('');
              setError('');
              onTypeChange(value);
            }}
            value={selectedType ?? ''}
          >
            <SelectTrigger
              aria-label="Document type"
              aria-invalid={!!typeError}
              aria-describedby={typeError ? `${ownerType}-document-type-error` : undefined}
            >
              <SelectValue placeholder="Select type">
                {typeOptions.find((option) => option.value === selectedType)?.label ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {typeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <IconLoader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconUpload data-icon="inline-start" />
          )}
          Upload
        </Button>
      </div>
      {typeError ? (
        <p id={`${ownerType}-document-type-error`} role="alert" className="text-sm text-destructive">
          {typeError}
        </p>
      ) : null}
    </form>
  );
}
