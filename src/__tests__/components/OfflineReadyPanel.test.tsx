import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadWhisperModel: vi.fn().mockResolvedValue(undefined),
  downloadNllbModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/churchAudioEngine', () => ({
  downloadWhisperModel: mocks.downloadWhisperModel,
  getWhisperModelIdForLanguage: (lang: string) =>
    lang === 'ceb' || lang === 'tl' ? 'Xenova/whisper-small' : 'Xenova/whisper-tiny',
}));

vi.mock('../../services/offlineEdgeTranslator', () => ({
  NLLB_MODEL_ID: 'Xenova/nllb-200-distilled-600M',
  downloadNllbModel: mocks.downloadNllbModel,
  isNllbLanguageSupported: (lang: string) => ['en', 'es', 'pt', 'tl'].includes(lang),
}));

import { OfflineReadyPanel } from '../../components/OfflineReadyPanel';
import {
  markOfflineModelDownloading,
  markOfflineModelReady,
  reportOfflineModelProgress,
  resetOfflineReadinessForTests,
} from '../../services/offlineReadiness';

describe('OfflineReadyPanel', () => {
  beforeEach(() => {
    resetOfflineReadinessForTests();
    mocks.downloadWhisperModel.mockClear();
    mocks.downloadNllbModel.mockClear();
  });

  it('shows both models as not downloaded and starts a download on tap', async () => {
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="es" targetLangCode="en" />);
    });

    expect(screen.getByText('Not ready yet')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /download/i });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    expect(mocks.downloadWhisperModel).toHaveBeenCalledWith('es');
    fireEvent.click(buttons[1]);
    expect(mocks.downloadNllbModel).toHaveBeenCalledTimes(1);
  });

  it('updates live with download progress and completion', async () => {
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="es" targetLangCode="en" />);
    });

    act(() => {
      markOfflineModelDownloading('Xenova/whisper-tiny');
      reportOfflineModelProgress('Xenova/whisper-tiny', {
        status: 'progress', file: 'encoder.onnx', loaded: 40, total: 100,
      });
    });
    expect(screen.getByText('Downloading 40%')).toBeInTheDocument();

    act(() => {
      markOfflineModelReady('Xenova/whisper-tiny');
      markOfflineModelReady('Xenova/nllb-200-distilled-600M');
    });
    expect(screen.getByText('Models downloaded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('checks the larger speech model for Cebuano and warns that translation uses the word list', async () => {
    markOfflineModelReady('Xenova/whisper-tiny');
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="ceb" targetLangCode="en" />);
    });

    expect(screen.getByText('Xenova/whisper-small')).toBeInTheDocument();
    expect(screen.getByText('Not ready yet')).toBeInTheDocument();
    expect(screen.getByText(/small built-in word list/i)).toBeInTheDocument();
  });
});
