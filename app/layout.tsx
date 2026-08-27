import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Phenome OBS — Organizador de notas de parcelas',
  description: 'Filtre, transforme e exporte observações de campo extraídas do Phenome diretamente no navegador.',
  openGraph: {
    title: 'Phenome OBS — Organizador de notas de parcelas',
    description: 'Notas de parcelas, organizadas. Filtre e transforme extrações do Phenome no navegador.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Phenome OBS — Notas de parcelas, organizadas.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Phenome OBS — Organizador de notas de parcelas',
    description: 'Notas de parcelas, organizadas. Filtre e transforme extrações do Phenome no navegador.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
