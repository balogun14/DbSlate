import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DbSlate | Database Introspection & Safe DDL Migrator',
  description:
    'Visually model databases, introspect existing schemas, generate safe, data-loss-aware SQL migrations, and export models for TypeScript, C#, Python, and Go.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body id="dbslate-app-root">{children}</body>
    </html>
  );
}
