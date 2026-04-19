import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Досье',
  description: 'Система досье сотрудников',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
