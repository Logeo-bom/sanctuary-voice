import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguagePicker } from '../../components/LanguagePicker';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';

function openPicker(label = 'Speaker 1 Language') {
  const onChange = vi.fn();
  render(
    <LanguagePicker
      label={label}
      value="en"
      languages={SUPPORTED_LANGUAGES}
      onChange={onChange}
      extraOptions={[{ code: 'auto', label: '✨ Auto-Detect (EN/EU)', keywords: 'auto detect' }]}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }));
  const search = screen.getByRole('combobox', { name: new RegExp(`search ${label}`, 'i') });
  const options = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent || '');
  return { onChange, search, options };
}

describe('LanguagePicker', () => {
  it('opens with the search box focused and every language listed', () => {
    const { search, options } = openPicker();
    expect(search).toHaveFocus();
    expect(options()).toHaveLength(SUPPORTED_LANGUAGES.length + 1);
  });

  it('filters as you type, best matches first', () => {
    const { search, options } = openPicker();
    fireEvent.change(search, { target: { value: 'sw' } });
    const list = options();
    expect(list[0]).toMatch(/Swahili/);
    expect(list.some((o) => /Swedish/.test(o))).toBe(true);
    expect(list.some((o) => /Korean/.test(o))).toBe(false);
  });

  it('ignores dialect names for one- or two-letter searches', () => {
    const { search, options } = openPicker();
    fireEvent.change(search, { target: { value: 's' } });
    expect(options().some((o) => /English/.test(o))).toBe(false);
  });

  it('finds languages by native name without accents, and by dialect', () => {
    const { search, options } = openPicker();
    fireEvent.change(search, { target: { value: 'espanol' } });
    expect(options()[0]).toMatch(/Spanish/);
    fireEvent.change(search, { target: { value: 'bisaya' } });
    expect(options()[0]).toMatch(/Cebuano/);
    fireEvent.change(search, { target: { value: 'davao' } });
    expect(options()[0]).toMatch(/Cebuano/);
  });

  it('selects with Enter and closes', () => {
    const { search, onChange } = openPicker();
    fireEvent.change(search, { target: { value: 'tag' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('tl');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects with a tap and shows a message when nothing matches', () => {
    const { search, onChange } = openPicker();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/no language matches/i)).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nor' } });
    fireEvent.click(screen.getByRole('option', { name: /Norwegian/ }));
    expect(onChange).toHaveBeenCalledWith('no');
  });

  it('closes on Escape without changing the language', () => {
    const { search, onChange } = openPicker();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
