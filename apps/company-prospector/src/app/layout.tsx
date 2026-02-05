import type { Metadata } from 'next';
import { SessionProvider } from '@/components/SessionProvider';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lookalike Generator | Find Decision Makers at Any Company',
  description: 'Find decision makers at a company and all its competitors. Powered by Draftboard.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <SessionProvider>
          <Header />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
