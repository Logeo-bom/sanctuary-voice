import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import {
  CHIRP_ACCESS_CODE_REQUIRED_EVENT,
  ChirpAccessCodeRequiredError,
  type ChirpTranslationResult,
} from '../../services/googleChirpTranslator';

const mocks = vi.hoisted(() => ({
  chunks: [] as Array<(blob: Blob, mime: string, duration: number) => void>,
  chirp: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../../services/googleChirpTranslator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/googleChirpTranslator')>()),
  transcribeAndTranslateWithChirp: mocks.chirp,
}));

vi.mock('../../services/churchAudioEngine', () => ({
  ChurchAudioEngine: class {
    constructor(_config: unknown, onChunk: (blob: Blob, mime: string, duration: number) => void) {
      mocks.chunks.push(onChunk);
    }
    setSourceLanguageHint() {}
    setForceOffline() {}
    async start() {}
    stop() { mocks.stop(); }
  },
  preloadWhisperModel: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const result: ChirpTranslationResult = {
  latencyMs: 42,
  utterances: [{
    speakerId: 'speaker_1', speakerLabel: 'Speaker 1', roleHint: 'main-speaker',
    sourceLanguageCode: 'ceb', sourceLanguageName: 'Cebuano',
    originalText: 'Old session original', translatedText: 'Old session caption',
  }],
};

async function toggle(label: string) {
  const text = await screen.findByText(label);
  const button = text.parentElement?.querySelector('button');
  if (!button) throw new Error(`Missing microphone button for ${label}`);
  fireEvent.click(button);
}

async function emitChunk(index: number) {
  await act(async () => {
    mocks.chunks[index](new Blob(['audio']), 'audio/webm', 4000);
  });
  await waitFor(() => expect(mocks.chirp).toHaveBeenCalledTimes(index + 1));
  expect(mocks.chirp.mock.calls[index][0].sourceLanguageCode).toBe('ceb');
}

describe('App Chirp session boundaries', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sanctuary_voice_source_lang_v1', 'ceb');
    mocks.chunks.length = 0;
    mocks.chirp.mockReset();
    mocks.stop.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('displays a Chirp response while its session is active', async () => {
    const request = deferred<ChirpTranslationResult>();
    mocks.chirp.mockReturnValueOnce(request.promise);
    render(<App />);
    await toggle('Tap to Listen');
    await screen.findByText('Tap to Stop Mic');
    await emitChunk(0);
    await act(async () => { request.resolve(result); await request.promise; });
    expect(await screen.findByText('Old session caption')).toBeInTheDocument();
  });

  it('keeps the microphone running when spoken audio is toggled and stops it on unmount', async () => {
    const request = deferred<ChirpTranslationResult>();
    mocks.chirp.mockReturnValueOnce(request.promise);
    const { unmount } = render(<App />);
    await toggle('Tap to Listen');
    await screen.findByText('Tap to Stop Mic');
    fireEvent.click(screen.getByText('Audio ON').closest('button')!);
    expect(screen.getByText('Text Only')).toBeInTheDocument();
    expect(mocks.stop).not.toHaveBeenCalled();
    await emitChunk(0);
    await act(async () => { request.resolve(result); await request.promise; });
    expect(await screen.findByText('Old session caption')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Text Only').closest('button')!);
    expect(mocks.stop).not.toHaveBeenCalled();
    unmount();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['stop', false, false],
    ['stop/restart', true, false],
    ['stop with rejection', false, true],
    ['stop/restart with rejection', true, true],
  ])('ignores a deferred Chirp response after %s', async (_label, restart, reject) => {
    const request = deferred<ChirpTranslationResult>();
    mocks.chirp.mockReturnValueOnce(request.promise);
    render(<App />);
    await toggle('Tap to Listen');
    await screen.findByText('Tap to Stop Mic');
    await emitChunk(0);
    await toggle('Tap to Stop Mic');
    await screen.findByText('Tap to Listen');
    if (restart) {
      await toggle('Tap to Listen');
      await screen.findByText('Tap to Stop Mic');
    }
    await act(async () => {
      if (reject) request.reject(new Error('Old session Chirp error'));
      else request.resolve(result);
      await request.promise.catch(() => {});
    });
    expect(screen.queryByText('Old session original')).not.toBeInTheDocument();
    expect(screen.queryByText('Old session caption')).not.toBeInTheDocument();
    expect(screen.queryByText('Old session Chirp error')).not.toBeInTheDocument();
  });

  it('shows the non-blocking access-code card instead of an error when Chirp needs the code', async () => {
    mocks.chirp.mockImplementationOnce(async () => {
      window.dispatchEvent(new CustomEvent(CHIRP_ACCESS_CODE_REQUIRED_EVENT, { detail: { invalid: false } }));
      throw new ChirpAccessCodeRequiredError(false);
    });
    render(<App />);
    await toggle('Tap to Listen');
    await screen.findByText('Tap to Stop Mic');
    await emitChunk(0);

    expect(await screen.findByRole('dialog', { name: /chirp access code/i })).toBeInTheDocument();
    expect(screen.queryByText(/enter the chirp operator access code\./i)).not.toBeInTheDocument();
    expect(screen.getByText('Tap to Stop Mic')).toBeInTheDocument();
  });

  it('never sends audio to Chirp once the connection drops', async () => {
    render(<App />);
    await toggle('Tap to Listen');
    await screen.findByText('Tap to Stop Mic');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      mocks.chunks[0](new Blob(['audio']), 'audio/webm', 4000);
    });
    expect(mocks.chirp).not.toHaveBeenCalled();
  });
});
