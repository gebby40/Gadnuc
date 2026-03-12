import type { Metadata } from 'next';
import { getTenantSettings } from '@/lib/tenant-api';
import { resolveTheme }      from '@/lib/themes';
import { ThemeProvider }     from '@/components/ThemeProvider';
import { CartProvider }      from '@/components/CartProvider';
import { StorefrontNav }     from '@/components/StorefrontNav';
import { StorefrontFooter }  from '@/components/StorefrontFooter';
import { StorefrontShell }   from '@/components/StorefrontShell';

interface Props {
  children: React.ReactNode;
  params:   { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const settings = await getTenantSettings(params.slug);
  return {
    title: {
      default:  settings.seo_title ?? settings.hero_title ?? params.slug,
      template: `%s | ${settings.seo_title ?? params.slug}`,
    },
    description: settings.seo_description ?? undefined,
    openGraph: {
      siteName: settings.seo_title ?? params.slug,
    },
  };
}

export default async function TenantLayout({ children, params }: Props) {
  const settings = await getTenantSettings(params.slug);
  const themeVars = resolveTheme(
    settings.theme,
    settings.primary_color,
    settings.accent_color,
  );

  return (
    <CartProvider>
      <ThemeProvider
        vars={themeVars}
        className="min-h-screen flex flex-col"
      >
        {/* Inject custom CSS if set by tenant */}
        {settings.custom_css && (
          <style dangerouslySetInnerHTML={{ __html: settings.custom_css }} />
        )}

        <StorefrontShell
          nav={
            <StorefrontNav
              slug={params.slug}
              logoUrl={settings.logo_url ?? null}
              storeName={settings.seo_title ?? params.slug}
            />
          }
          footer={
            <StorefrontFooter
              contactEmail={settings.contact_email ?? null}
              contactPhone={settings.contact_phone ?? null}
              socialLinks={settings.social_links ?? {}}
              storeName={settings.seo_title ?? params.slug}
            />
          }
        >
          {children}
        </StorefrontShell>
      </ThemeProvider>
    </CartProvider>
  );
}
