import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChirpAccessCodeSettings } from '../../components/ChirpAccessCode';
import {
  clearChirpAccessCode,
  hasChirpAccessCode,
  isChirpAccessCodeSaved,
  setChirpAccessCode,
} from '../../services/googleChirpTranslator';

describe('ChirpAccessCodeSettings', () => {
  afterEach(() => clearChirpAccessCode());

  it('uses a masked text field the password manager will not save or fill', () => {
    render(<ChirpAccessCodeSettings />);
    const input = screen.getByLabelText(/chirp operator access code/i);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('hides the field once a code is saved and offers Change / Forget', () => {
    setChirpAccessCode('saved-code', true);
    render(<ChirpAccessCodeSettings />);

    expect(screen.getByText('Saved on this device')).toBeInTheDocument();
    expect(screen.queryByLabelText(/chirp operator access code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /change code/i }));
    expect(screen.getByLabelText(/chirp operator access code/i)).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /remember on this device/i })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByLabelText(/chirp operator access code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /forget code/i }));
    expect(hasChirpAccessCode()).toBe(false);
    expect(isChirpAccessCodeSaved()).toBe(false);
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('saves a new code and returns to the compact view', () => {
    render(<ChirpAccessCodeSettings />);
    fireEvent.change(screen.getByLabelText(/chirp operator access code/i), { target: { value: 'new-code' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /remember on this device/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(isChirpAccessCodeSaved()).toBe(true);
    expect(screen.getByText('Saved on this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change code/i })).toBeInTheDocument();
  });
});
