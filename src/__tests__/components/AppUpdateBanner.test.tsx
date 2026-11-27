import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppUpdateBanner } from '../../components/AppUpdateBanner';
import { APP_UPDATE_READY_EVENT } from '../../pwa/registerServiceWorker';

describe('AppUpdateBanner', () => {
  it('stays hidden until a new version is ready, then can be dismissed', () => {
    render(<AppUpdateBanner />);
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(APP_UPDATE_READY_EVENT));
    });
    expect(screen.getByText(/new version of SanctuaryVoice is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss update notice/i }));
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });
});
