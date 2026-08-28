# Phenome OBS

Aplicação local para organizar e exportar extrações de Observations e Plots do Phenome. Todo o processamento dos arquivos acontece no navegador.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie este projeto para a branch `main`.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment → Source**, selecione **GitHub Actions**.
4. Abra a aba **Actions** e acompanhe o workflow **Deploy to GitHub Pages**.

Depois disso, cada atualização enviada para `main` será publicada automaticamente. O workflow gera uma versão estática em `out/` e ajusta o caminho dos arquivos tanto para sites de projeto (`usuario.github.io/repositorio`) quanto para sites de usuário ou organização (`usuario.github.io`).

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

Para conferir localmente a versão estática usada pelo GitHub Pages:

```bash
GITHUB_PAGES=true GITHUB_REPOSITORY=usuario/repositorio pnpm build:pages
```
