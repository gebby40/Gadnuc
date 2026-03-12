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
  const displayName = settings.store_name ?? settings.seo_title ?? params.slug;
  return {
    title: {
      default:  settings.seo_title ?? displayName,
      template: `%s | ${displayName}`,
    },
    description: settings.seo_description ?? undefined,
    openGraph: {
      siteName: displayName,
    },
  };
}

export default async function TenantLayout({ children, params }: Props) {
  const settings = await getTenantSettings(params.slug);
  const displayName = settings.store_name ?? settings.seo_title ?? params.slug;

  const themeVars = resolveTheme(
    settings.theme,
    settings.primary_color,
    settings.accent_color,
    settings.nav_bg_color,
    settings.nav_text_color,
    settings.footer_bg_color,
    settings.footer_text_color,
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
          slug={params.slug}
          nav={
            <StorefrontNav
              slug={params.slug}
              logoUrl={settings.logo_url ?? null}
              storeName={displayName}
            />
          }
          footer={
            <StorefrontFooter
              contactEmail={settings.contact_email ?? null}
              contactPhone={settings.contact_phone ?? null}
              socialLinks={settings.social_links ?? {}}
              storeName={displayName}
            />
          }
        >
          {children}
        </StorefrontShell>
      </ThemeProvider>
    </CartProvider>
  );
}
