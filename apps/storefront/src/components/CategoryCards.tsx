import Link from 'next/link';

interface Props {
  categories: string[];
  tenantSlug: string;
}

// Simple color palette for category cards — cycles through these
const CARD_COLORS = [
  { bg: '#f0f4ff', text: '#1e40af' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#f0fdf4', text: '#166534' },
  { bg: '#fdf2f8', text: '#9d174d' },
  { bg: '#f5f3ff', text: '#5b21b6' },
  { bg: '#fff7ed', text: '#9a3412' },
];

export function CategoryCards({ categories, tenantSlug }: Props) {
  if (categories.length === 0) return null;

  // Show max 6 categories
  const displayed = categories.slice(0, 6);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <h2
        className="text-2xl font-bold mb-6"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
      >
        Shop by Category
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {displayed.map((cat, i) => {
          const colors = CARD_COLORS[i % CARD_COLORS.length];
          return (
            <Link
              key={cat}
              href={`/tenant/${tenantSlug}/products?category=${encodeURIComponent(cat)}`}
              className="block rounded-xl p-6 sm:p-8 text-center transition-transform duration-200 hover:scale-[1.02]"
              style={{
                background: colors.bg,
                textDecoration: 'none',
              }}
            >
              <span
                className="text-sm sm:text-base font-semibold"
                style={{ color: colors.text }}
              >
                {cat}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
