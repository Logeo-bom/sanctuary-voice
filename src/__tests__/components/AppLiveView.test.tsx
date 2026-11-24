import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../App';

describe('App Live Teleprompter & Stage Controls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders application header and main controls cleanly', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText(/SanctuaryVoice/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap to Listen/i)).toBeInTheDocument();
  });

  it('allows switching display styles between Live, Continuous, and Cards', async () => {
    await act(async () => {
      render(<App />);
    });
    
    // Check reading mode switchers by title
    const liveBtn = screen.getByTitle(/Focused Live Teleprompter for active speaker/i);
    const continuousBtn = screen.getByTitle(/Continuous live transcript flow/i);
    const cardsBtn = screen.getByTitle(/Individual segment cards/i);

    expect(liveBtn).toBeInTheDocument();
    expect(continuousBtn).toBeInTheDocument();
    expect(cardsBtn).toBeInTheDocument();

    // Click Live Mode and verify active highlight class
    await act(async () => {
      fireEvent.click(liveBtn);
    });
    expect(liveBtn).toHaveClass('bg-sky-500');

    // Click Cards Mode and verify active highlight class
    await act(async () => {
      fireEvent.click(cardsBtn);
    });
    expect(cardsBtn).toHaveClass('bg-sky-500');

    // Click Continuous Mode and verify active highlight class
    await act(async () => {
      fireEvent.click(continuousBtn);
    });
    expect(continuousBtn).toHaveClass('bg-sky-500');
  });

  it('opens and closes the Voice Channel selection bottom sheet', async () => {
    await act(async () => {
      render(<App />);
    });

    // Click the compact voice channel dropdown pill
    const voiceChannelPill = screen.getByTitle(/Click to select stage voice channel/i);
    expect(voiceChannelPill).toBeInTheDocument();
    
    await act(async () => {
      fireEvent.click(voiceChannelPill);
    });

    // Verify modal elements
    expect(screen.getByText(/Stage Voice Channel/i)).toBeInTheDocument();
    expect(screen.getByText(/All Voices \(Combined Stream\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto-Follow Active Voice/i)).toBeInTheDocument();
    expect(screen.getByText(/2-Window Split View/i)).toBeInTheDocument();

    // Close with Close button
    const closeBtn = screen.getByTitle(/Close channel selector/i);
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Stage Voice Channel/i)).not.toBeInTheDocument();
    });
  });

  it('supports selecting different voice channels in bottom sheet', async () => {
    await act(async () => {
      render(<App />);
    });

    const voiceChannelPill = screen.getByTitle(/Click to select stage voice channel/i);
    await act(async () => {
      fireEvent.click(voiceChannelPill);
    });

    // Select Auto-Follow
    const autoFollowOption = screen.getByRole('button', { name: /Auto-Follow Active Voice/i });
    await act(async () => {
      fireEvent.click(autoFollowOption);
    });

    // Modal closes and trigger updates
    await waitFor(() => {
      expect(screen.queryByText(/Stage Voice Channel/i)).not.toBeInTheDocument();
    });
    expect(screen.getByTitle(/Click to select stage voice channel/i)).toHaveTextContent(/Auto-Follow/i);
  });

  it('opens Settings modal and responds to Escape key', async () => {
    await act(async () => {
      render(<App />);
    });

    // Open settings modal
    const settingsBtn = screen.getByTitle(/Settings & Pre-Paid Minutes/i);
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByText(/AI Engines, Earphone Voice & Token Credits/i)).toBeInTheDocument();

    // Press Escape to dismiss
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    await waitFor(() => {
      expect(screen.queryByText(/AI Engines, Earphone Voice & Token Credits/i)).not.toBeInTheDocument();
    });
  });
});
