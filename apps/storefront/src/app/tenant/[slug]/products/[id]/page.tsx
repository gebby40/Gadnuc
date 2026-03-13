import type { Metadata } from 'next';
import { notFound }  from 'next/navigation';
import { getProduct, getRelatedProducts } from '@/lib/tenant-api';
import { ProductDetailView } from './ProductDetailView';

interface PageProps {
  params: { slug: string; id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProduct(params.slug, params.id);
  if (!product) return { title: 'Product Not Found' };
  return {
    title:       product.name,
    description: product.description?.replace(/<[^>]*>/g, '').slice(0, 160) ?? undefined,
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = await getProduct(params.slug, params.id);
  if (!product) notFound();

  // Related products (same category)
  const related = await getRelatedProducts(params.slug, product.id, product.category);

  return (
    <ProductDetailView
      slug={params.slug}
      ssrProduct={product}
      related={related}
    />
  );
}
