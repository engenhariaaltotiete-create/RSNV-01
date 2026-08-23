import { useId } from 'react';

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  required?: boolean;
  onChange: (value: string) => void;
};

// Campo híbrido: visualmente funciona como lista, mas o usuário também pode digitar um valor novo.
export function EditableListInput({ label, value, options, required, onChange }: Props) {
  const listId = useId();
  return (
    <label className="field">
      <span>{label}{required && <b className="required"> *</b>}</span>
      <input value={value} list={listId} onChange={(e) => onChange(e.target.value)} required={required} />
      <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </label>
  );
}
