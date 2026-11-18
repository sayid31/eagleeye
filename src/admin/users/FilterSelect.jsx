/** A labelled filter `Select` over a `{value: text}` map (the label is the accessible name; the value shows in the trigger). */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** @param {{label: string, value: string, options: Record<string, string>, onChange: (value: string) => void, className?: string}} props */
export function FilterSelect({ label, value, options, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
