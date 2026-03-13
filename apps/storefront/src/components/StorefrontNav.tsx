'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCart } from './CartProvider';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  slug:       string;
  logoUrl:    string | null;
  storeName:  string;
}

export function StorefrontNav({ slug, logoUrl, storeName }: Props) {
  const { totalItems, openDrawer } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname.includes('/dashboard');
  const base = `/tenant/${slug}`;
  const [searchValue, setSearchValue] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`${base}/products?search=${encodeURIComponent(searchValue.trim())}`);
      setMobileMenuOpen(false);
    }
  }

  return (
    <nav
      style={{
        backgroundColor: 'var(--color-nav-bg)',
        color: 'var(--color-nav-text)',
        borderBottom: '1px solid var(--color-border)',
      }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

        {/* Left: Logo + store name */}
        <Link
          href={base}
          className="flex items-center gap-2.5 no-underline flex-shrink-0"
          style={{ color: 'var(--color-nav-text)' }}
        >
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={storeName}
              width={36}
              height={36}
              className="object-contain rounded"
              sizes="36px"
              quality={90}
            />
          )}
          <span className="text-lg font-bold tracking-tight">{storeName}</span>
        </Link>

        {/* Center: Search bar (hidden on mobile) */}
        <form
          onSubmit={handleSearch}
          className="hidden sm:flex flex-1 max-w-md mx-4"
        >
          <div className="relative w-full">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2 rounded-full text-sm outline-none"
              style={{
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
              }}
            />
            {/* Search icon */}
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </form>

        {/* Right: Nav links + Cart */}
        <div className="flex items-center gap-5">
          <Link
            href={`${base}/products`}
            className="hidden sm:inline-block font-medium text-sm hover:opacity-75 transition-opacity"
            style={{ color: 'var(--color-nav-text)', textDecoration: 'none' }}
          >
            Shop
          </Link>

          {/* Cart icon — opens mini-cart drawer (hidden on dashboard pages) */}
          {!isDashboard && (
            <button
              onClick={openDrawer}
              className="relative hover:opacity-75 transition-opacity"
              style={{ background: 'none', border: 'none', color: 'var(--color-nav-text)', cursor: 'pointer', padding: 0 }}
              aria-label="Cart"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
              {totalItems > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold min-w-[18px] h-[18px] px-1"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-accent-fg)',
                    fontSize: '0.65rem',
                  }}
                >
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            className="sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
            style={{ background: 'none', border: 'none', color: 'var(--color-nav-text)', cursor: 'pointer', padding: 0 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden px-4 pb-4"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <form onSubmit={handleSearch} className="mb-3 mt-3">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products..."
              className="w-full px-4 py-2 rounded-full text-sm outline-none"
              style={{
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
              }}
            />
          </form>
          <Link
            href={`${base}/products`}
            className="block py-2 text-sm font-medium"
            style={{ color: 'var(--color-nav-text)', textDecoration: 'none' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            Shop All
          </Link>
          <Link
            href={`${base}/support`}
            className="block py-2 text-sm font-medium"
            style={{ color: 'var(--color-nav-text)', textDecoration: 'none' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            Support
          </Link>
        </div>
      )}
    </nav>
  );
}
