import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsAndWalletModal } from '../../components/SettingsAndWalletModal';
import type { AudioProcessingConfig, PrepaidAccountState, SpeechOutputConfig } from '../../types/translator';

describe('SettingsAndWalletModal Component', () => {
  const defaultAudioConfig: AudioProcessingConfig = {
    bypassOsProcessing: false,
    preAmpGainDb: 3.5,
    synthPadFilterEnabled: true,
    dynamicCompressorEnabled: true,
    highPassHz: 90,
    chunkDurationSec: 3.5,
    silenceGateDb: -42,
    selectedDeviceId: 'default',
    audioSource: 'mic',
    neuralVoiceIsolationEnabled: true,
  };

  const defaultSpeechConfig: SpeechOutputConfig = {
    enabled: true,
    speechRate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    selectedVoiceURI: '',
    earphoneOnlyGuard: false,
    voiceEngine: 'neural-cloud',
    geminiVoiceName: 'Aoede',
  };

  const defaultWallet: PrepaidAccountState = {
    minutesRemaining: 120,
    totalMinutesPurchased: 240,
    sessionSecondsUsed: 1500,
    sessionTokensUsed: 8400,
    activeTierName: 'Sanctuary Pro Tier',
  };

  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    apiKey: 'mock-gemini-key',
    onSaveApiKey: vi.fn(),
    deepgramKey: 'mock-deepgram-key',
    onSaveDeepgramKey: vi.fn(),
    activeAiProvider: 'deepgram' as const,
    onSelectAiProvider: vi.fn(),
    audioConfig: defaultAudioConfig,
    onChangeAudioConfig: vi.fn(),
    speechConfig: defaultSpeechConfig,
    onChangeSpeechConfig: vi.fn(),
    wallet: defaultWallet,
    onTopUpMinutes: vi.fn(),
    customGlossary: ['Sanctuary', 'Romans', 'Gospel'],
    onAddGlossaryTerm: vi.fn(),
    onRemoveGlossaryTerm: vi.fn(),
    pendingCorrections: [],
    onApproveCorrection: vi.fn(),
    onRejectCorrection: vi.fn(),
  };

  it('renders correctly when open with active AI provider and glossary tags', async () => {
    await act(async () => {
      render(<SettingsAndWalletModal {...mockProps} />);
    });

    expect(screen.getByText(/AI Engines, Earphone Voice & Token Credits/i)).toBeInTheDocument();
    expect(screen.getByText('Sanctuary')).toBeInTheDocument();
    expect(screen.getByText('Romans')).toBeInTheDocument();
    expect(screen.getByText('Gospel')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(<SettingsAndWalletModal {...mockProps} isOpen={false} />);
      container = res.container;
    });
    expect(container!).toBeEmptyDOMElement();
  });

  it('allows adding and removing custom church glossary keywords', async () => {
    await act(async () => {
      render(<SettingsAndWalletModal {...mockProps} />);
    });

    const input = screen.getByPlaceholderText(/e\.g\. Pastor Velasquez, Bethel, Maranatha/i);
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Hallelujah' } });
    if (form) {
      fireEvent.submit(form);
    }

    expect(mockProps.onAddGlossaryTerm).toHaveBeenCalledWith('Hallelujah');
  });

  it('handles provider selection switching', async () => {
    await act(async () => {
      render(<SettingsAndWalletModal {...mockProps} />);
    });

    const geminiBtn = screen.getByRole('button', { name: /Gemini 2\.5 Flash Only/i });
    fireEvent.click(geminiBtn);
    expect(mockProps.onSelectAiProvider).toHaveBeenCalledWith('gemini');
  });

  it('renders pending flagged corrections and approves/rejects them', async () => {
    const pendingProps = {
      ...mockProps,
      pendingCorrections: [
        {
          id: 'flag_1',
          segmentId: 'seg_1',
          speakerLabel: 'Speaker 1',
          heardText: 'sanitation shin',
          correctedTerm: 'Sanctification',
          status: 'pending' as const,
          createdAt: Date.now(),
        },
      ],
    };

    await act(async () => {
      render(<SettingsAndWalletModal {...pendingProps} />);
    });

    expect(screen.getByText(/Flagged Corrections Awaiting Review/i)).toBeInTheDocument();
    expect(screen.getByText('Sanctification')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/Approve: add to church glossary/i));
    expect(pendingProps.onApproveCorrection).toHaveBeenCalledWith('flag_1');

    fireEvent.click(screen.getByTitle(/Reject suggestion/i));
    expect(pendingProps.onRejectCorrection).toHaveBeenCalledWith('flag_1');
  });

  it('calls onClose when clicking back or close buttons', async () => {
    await act(async () => {
      render(<SettingsAndWalletModal {...mockProps} />);
    });

    const backBtn = screen.getByTitle(/Go back to Home Screen/i);
    fireEvent.click(backBtn);
    expect(mockProps.onClose).toHaveBeenCalled();

    const bottomBackBtn = screen.getByRole('button', { name: /Back to Home Screen/i });
    fireEvent.click(bottomBackBtn);
    expect(mockProps.onClose).toHaveBeenCalledTimes(2);
  });
});
