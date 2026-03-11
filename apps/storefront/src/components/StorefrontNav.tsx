'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from './CartProvider';

interface Props {
  slug:       string;
  logoUrl:    string | null;
  storeName:  string;
}

export function StorefrontNav({ slug, logoUrl, storeName }: Props) {
  const { totalItems } = useCart();
  const base = `/tenant/${slug}`;

  return (
    <nav
      style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-fg)' }}
      className="sticky top-0 z-50 shadow-md"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

        {/* Logo / store name */}
        <Link href={base} className="flex items-center gap-3 no-underline" style={{ color: 'var(--color-primary-fg)' }}>
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={storeName}
              width={40}
              height={40}
              className="object-contain rounded"
              unoptimized
            />
          )}
          <span className="text-lg font-bold tracking-tight">{storeName}</span>
        </Link>

        {/* Links */}
        <ul className="flex items-center gap-5 list-none m-0 p-0">
          <li>
            <Link
              href={`${base}/products`}
              className="font-medium text-sm hover:opacity-75 transition-opacity"
              style={{ color: 'var(--color-primary-fg)', textDecoration: 'none' }}
            >
              Products
            </Link>
          </li>
          <li>
            <Link
              href={`${base}/support`}
              className="font-medium text-sm hover:opacity-75 transition-opacity"
              style={{ color: 'var(--color-primary-fg)', textDecoration: 'none' }}
            >
              Support
            </Link>
          </li>
          <li>
            <Link
              href={`${base}/cart`}
              className="relative font-medium text-sm hover:opacity-75 transition-opacity flex items-center gap-1"
              style={{ color: 'var(--color-primary-fg)', textDecoration: 'none' }}
            >
              <span>Cart</span>
              {totalItems > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-xs font-bold min-w-[20px] h-5 px-1"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-accent-fg)',
                  }}
                >
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
