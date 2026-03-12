'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const SORT_OPTIONS = [
  { value: 'name_asc',   label: 'Name A–Z' },
  { value: 'name_desc',  label: 'Name Z–A' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest',     label: 'Newest' },
];

interface Props {
  currentSort: string;
}

export function SortDropdown({ currentSort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('sort', e.target.value);
    qs.delete('page'); // reset to page 1 on sort change
    router.push(`?${qs.toString()}`);
  }

  return (
    <select
      defaultValue={currentSort}
      onChange={handleChange}
      className="appearance-none px-4 py-2 pr-8 rounded-lg text-sm outline-none cursor-pointer"
      style={{
        border:     '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        color:      'var(--color-text)',
      }}
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
