import type { Metadata } from 'next';
import { AuthProvider } from '../components/AuthProvider';

export const metadata: Metadata = {
  title: 'Gadnuc',
  description: 'Multi-tenant inventory & store management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
