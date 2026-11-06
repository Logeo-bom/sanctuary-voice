export default async function handler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = (searchParams.get('q') || '').trim();
    const lang = (searchParams.get('tl') || 'en').trim();

    if (!text) {
      return new Response('Missing text', { status: 400 });
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
      return new Response('TTS upstream error', { status: upstream.status });
    }

    const audioBuffer = await upstream.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : 'Internal TTS error',
      { status: 500 }
    );
  }
}
