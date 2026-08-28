import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserOrOrganizationSite = repositoryName.endsWith('.github.io');
const pagesBasePath = isGitHubPages && repositoryName && !isUserOrOrganizationSite ? `/${repositoryName}` : '';

const nextConfig: NextConfig = isGitHubPages ? {
  output: 'export',
  trailingSlash: true,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
} : {};

export default nextConfig;
