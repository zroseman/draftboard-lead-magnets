import type { Metadata } from 'next';
import { SessionProvider } from '@/components/SessionProvider';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'Company Prospector | Find Decision Makers at Any Company',
  description: 'Find the right people at target companies by job title. Powered by Draftboard.',
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
