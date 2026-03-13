'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Pricing index — redirect to Discount Rules by default */
export default function PricingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  useEffect(() => {
    router.replace(`/tenant/${slug}/dashboard/pricing/discounts`);
  }, [slug, router]);

  return null;
}
