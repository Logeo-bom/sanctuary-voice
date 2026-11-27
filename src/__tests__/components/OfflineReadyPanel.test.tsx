import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadWhisperModel: vi.fn().mockResolvedValue(undefined),
  downloadNllbModel: vi.fn().mockResolvedValue(undefined),
  removeWhisperModel: vi.fn().mockResolvedValue(undefined),
  removeNllbModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/churchAudioEngine', () => ({
  downloadWhisperModel: mocks.downloadWhisperModel,
  removeWhisperModel: mocks.removeWhisperModel,
  getWhisperModelIdForLanguage: (lang: string) =>
    lang === 'ceb' || lang === 'tl' ? 'Xenova/whisper-small' : 'Xenova/whisper-tiny',
}));

vi.mock('../../services/offlineEdgeTranslator', () => ({
  NLLB_MODEL_ID: 'Xenova/nllb-200-distilled-600M',
  downloadNllbModel: mocks.downloadNllbModel,
  isNllbLanguageSupported: (lang: string) => ['en', 'es', 'pt', 'tl', 'ceb'].includes(lang),
  removeNllbModel: mocks.removeNllbModel,
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
    mocks.removeWhisperModel.mockClear();
    mocks.removeNllbModel.mockClear();
  });

  it('shows both models as not downloaded and starts a download on tap', async () => {
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="es" targetLangCode="en" />);
    });

    expect(screen.getByText('Not ready yet')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^download$/i });
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

  it('checks the larger speech model for Cebuano and covers it with the translation model', async () => {
    markOfflineModelReady('Xenova/whisper-tiny');
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="ceb" targetLangCode="en" />);
    });

    expect(screen.getByText('Xenova/whisper-small')).toBeInTheDocument();
    expect(screen.getByText('Not ready yet')).toBeInTheDocument();
    expect(screen.queryByText(/small built-in word list/i)).not.toBeInTheDocument();
  });

  it('preselects the mission pack matching the current languages and downloads it in one tap', async () => {
    const onApplyLanguages = vi.fn();
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="ceb" targetLangCode="en" onApplyLanguages={onApplyLanguages} />);
    });

    expect(screen.getByRole('combobox', { name: /mission pack/i })).toHaveValue('ph-bisaya');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /download pack \(~1150 MB\)/i }));
    });
    expect(onApplyLanguages).not.toHaveBeenCalled();
    expect(mocks.downloadWhisperModel).toHaveBeenCalledWith('ceb');
    expect(mocks.downloadNllbModel).toHaveBeenCalledTimes(1);
  });

  it('switches app languages and downloads only missing files for a different pack', async () => {
    markOfflineModelReady('Xenova/nllb-200-distilled-600M');
    const onApplyLanguages = vi.fn();
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="es" targetLangCode="en" onApplyLanguages={onApplyLanguages} />);
    });

    fireEvent.change(screen.getByRole('combobox', { name: /mission pack/i }), { target: { value: 'ph-bisaya' } });
    fireEvent.click(screen.getByRole('radio', { name: /english speaker → cebuano/i }));
    expect(screen.getByText(/sets speaker 1 to english/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use & download \(~40 MB\)/i }));
    });
    expect(onApplyLanguages).toHaveBeenCalledWith('en', 'ceb');
    expect(mocks.downloadWhisperModel).toHaveBeenCalledWith('en');
    expect(mocks.downloadNllbModel).not.toHaveBeenCalled();
  });

  it('blocks a pack download when the device does not have enough free space', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { estimate: () => Promise.resolve({ quota: 500 * 1024 * 1024, usage: 0 }) },
    });
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="ceb" targetLangCode="en" />);
    });

    expect(screen.getByText(/not enough space/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pack/i })).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it('shows approximate model sizes and removes ready models from the device', async () => {
    markOfflineModelReady('Xenova/whisper-tiny');
    markOfflineModelReady('Xenova/nllb-200-distilled-600M');
    await act(async () => {
      render(<OfflineReadyPanel sourceLangCode="en" targetLangCode="es" />);
    });

    expect(screen.getByText(/\(~40 MB\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(~900 MB\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /remove speech recognition model/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove translation model/i }));
    expect(mocks.removeWhisperModel).toHaveBeenCalledWith('en');
    expect(mocks.removeNllbModel).toHaveBeenCalledTimes(1);
  });
});
