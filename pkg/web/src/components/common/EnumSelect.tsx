import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';

type EnumSelectProps<T extends string> = {
  'aria-label': string;
  labels: Record<T, string>;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
};

/** A select over a closed set of string values, each rendered through its label. */
export function EnumSelect<T extends string>({ labels, onChange, options, value, ...props }: EnumSelectProps<T>) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate === next);
        if (option !== undefined) onChange(option);
      }}
    >
      <SelectTrigger aria-label={props['aria-label']}>
        <SelectValue>{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
