import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

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
  plugins: [react(), tailwindcss(), neuralVoiceProxyPlugin()],
  css: {
    postcss: {
      plugins: [],
    },
  },
});
