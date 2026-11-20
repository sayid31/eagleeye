// src/admin/config/ProviderChoiceSelect.jsx
/** A voice / model select that shows the value in use (see providerForm.choiceView); "use the default" clears the override. */
import { FormField } from '@/components/app/FormField.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { choiceView, overrideFromItem } from './providerForm.js';

/** @param {{label: string, description: string, error?: string, selected: string, saved: string, effective: {value: string}, options: string[], onChange: (override: string) => void}} props */
export function ProviderChoiceSelect({ label, description, error, selected, saved, effective, options, onChange }) {
  const view = choiceView({ selected, saved, effective, options });
  return (
    <FormField label={label} description={description} error={error}>
      {(control) => (
        <Select value={view.value} onValueChange={(item) => onChange(overrideFromItem(item))}>
          <SelectTrigger {...control} className="w-full sm:max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {view.items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
