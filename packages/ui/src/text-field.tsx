import type { ComponentProps } from 'react';

export function TextField({ label, id, ...props }: ComponentProps<'input'> & { label: string; id: string }) {
  return <label className="text-field" htmlFor={id}><span>{label}</span><input {...props} id={id} /></label>;
}
