import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => !name.startsWith('.')).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Emits `sw.js` (from src/pwa/sw-template.js) with the exact list of built files to precache and a
 * version hash of their contents, so the app shell can open without internet. Build-only.
 */
function sanctuaryServiceWorkerPlugin(): Plugin {
  return {
    name: 'sanctuary-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const urls = new Set<string>(['/']);

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.map')) continue;
        if (fileName !== 'index.html') urls.add(`/${fileName}`);
        hash.update(fileName);
        hash.update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      }

      const publicDir = join(process.cwd(), 'public');
      for (const file of listFiles(publicDir)) {
        const url = `/${relative(publicDir, file).split('\\').join('/')}`;
        if (url === '/sw.js') continue;
        urls.add(url);
        hash.update(url);
        hash.update(readFileSync(file));
      }

      const template = readFileSync(join(process.cwd(), 'src/pwa/sw-template.js'), 'utf8');
      hash.update(template);
      const source = template
        .replace("'__CACHE_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE_URLS__', JSON.stringify([...urls], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

function neuralVoiceProxyPlugin(): Plugin {
  return {
    name: 'neural-voice-proxy',
    configureServer(server) {
      server.middlewares.use('/api/neural-tts', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost');
          const text = (urlObj.searchParams.get('q') || '').trim();
          const lang = (urlObj.searchParams.get('tl') || 'en').trim();

          if (!text) {
            res.statusCode = 400;
            res.end('Missing text');
            return;
          }

          const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
            text.slice(0, 200)
          )}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

          const upstream = await fetch(ttsUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
            },
          });

          if (!upstream.ok) {
            res.statusCode = upstream.status;
            res.end('TTS upstream error');
            return;
          }

          const arrayBuffer = await upstream.arrayBuffer();
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : 'TTS proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), neuralVoiceProxyPlugin(), sanctuaryServiceWorkerPlugin()],
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
