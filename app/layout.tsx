import type { Metadata } from 'next';
import './globals.css';

const [repositoryOwner = '', repositoryName = ''] = process.env.GITHUB_REPOSITORY?.split('/') ?? [];
const pagesBasePath = process.env.GITHUB_PAGES === 'true' && repositoryName && !repositoryName.endsWith('.github.io') ? `/${repositoryName}` : '';
const socialImage = `${pagesBasePath}/og.png`;
const publicOrigin = process.env.GITHUB_PAGES === 'true' && repositoryOwner && repositoryName
  ? repositoryName.endsWith('.github.io') ? `https://${repositoryName}` : `https://${repositoryOwner}.github.io`
  : 'https://phenome-obs-parcelas.gdmseeds-whe-7678.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  title: 'Phenome OBS — Organizador de notas de parcelas',
  description: 'Filtre, transforme e exporte extrações de Observations e Plots do Phenome diretamente no navegador.',
  openGraph: {
    title: 'Phenome OBS — Organizador de notas de parcelas',
    description: 'Observations e Plots, organizados. Filtre e transforme extrações do Phenome no navegador.',
    images: [{ url: socialImage, width: 1200, height: 630, alt: 'Phenome OBS — Notas de parcelas, organizadas.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Phenome OBS — Organizador de notas de parcelas',
    description: 'Observations e Plots, organizados. Filtre e transforme extrações do Phenome no navegador.',
    images: [socialImage],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
