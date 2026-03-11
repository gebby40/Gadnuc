'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface Props {
  categories:      string[];
  selectedCategory?: string;
}

export function CategoryFilter({ categories, selectedCategory }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  function select(category: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set('category', category);
    } else {
      params.delete('category');
    }
    params.delete('page'); // reset pagination on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => select(null)}
        className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
        style={{
          backgroundColor: !selectedCategory ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
          color: !selectedCategory ? 'var(--color-primary-fg)' : 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => select(cat)}
          className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
          style={{
            backgroundColor: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
            color: selectedCategory === cat ? 'var(--color-primary-fg)' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
