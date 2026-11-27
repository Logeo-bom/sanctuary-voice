import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { LanguageOption } from '../types/translator';

export interface LanguagePickerExtraOption {
  code: string;
  label: string;
  /** Extra words this option should match when searching (e.g. "auto detect"). */
  keywords?: string;
}

interface LanguagePickerProps {
  label: string;
  value: string;
  languages: LanguageOption[];
  onChange: (code: string) => void;
  /** Options listed before the languages, e.g. Auto-Detect. */
  extraOptions?: LanguagePickerExtraOption[];
  /** Which edge of the trigger the list lines up with (keeps it on screen in a 2-column row). */
  align?: 'left' | 'right';
  triggerClassName?: string;
}

interface PickerItem {
  code: string;
  label: string;
  flag?: string;
  nativeName?: string;
  searchText: string[];
}

/** Lower-case and strip accents so "espanol" finds "Español" and "francais" finds "Français". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Ranks items for a query: names that start with it first, then any word that starts with it, then
 * anything containing it (names, native names, codes, dialects). Keeps the original order within a rank.
 */
export function filterPickerItems<T extends { searchText: string[] }>(items: T[], query: string): T[] {
  const q = normalizeForSearch(query);
  if (!q) return items;
  const scored: Array<{ item: T; score: number; index: number }> = [];
  items.forEach((item, index) => {
    let best = Infinity;
    item.searchText.forEach((raw, fieldIndex) => {
      // Short searches (1–2 letters) only match the start of a word, and dialects (4th field on) only
      // count from 3 letters, so a single "s" doesn't pull in English via "Scottish" or "Engli-s-h".
      if (fieldIndex >= 3 && q.length < 3) return;
      const text = normalizeForSearch(raw);
      // Earlier fields (name, native name) outrank later ones (code, dialects).
      const fieldPenalty = fieldIndex * 0.1;
      if (text.startsWith(q)) best = Math.min(best, 0 + fieldPenalty);
      else if (text.split(/[\s/()\-,]+/).some((word) => word.startsWith(q))) best = Math.min(best, 1 + fieldPenalty);
      else if (q.length >= 3 && text.includes(q)) best = Math.min(best, 2 + fieldPenalty);
    });
    if (best !== Infinity) scored.push({ item, score: best, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item);
}

/**
 * Searchable language selector. Tapping it opens a search box (keyboard ready) with the list below,
 * filtered as the user types. Arrow keys + Enter select, Escape or tapping outside closes.
 */
export const LanguagePicker: React.FC<LanguagePickerProps> = ({
  label,
  value,
  languages,
  onChange,
  extraOptions = [],
  align = 'left',
  triggerClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const items = useMemo<PickerItem[]>(
    () => [
      ...extraOptions.map((o) => ({
        code: o.code,
        label: o.label,
        searchText: [o.label, o.keywords || '', o.code],
      })),
      ...languages.map((l) => ({
        code: l.code,
        label: l.name,
        flag: l.flag,
        nativeName: l.nativeName !== l.name ? l.nativeName : undefined,
        searchText: [l.name, l.nativeName, l.code, ...l.dialectExamples],
      })),
    ],
    [extraOptions, languages]
  );

  const results = useMemo(() => filterPickerItems(items, query), [items, query]);
  const selected = items.find((i) => i.code === value);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (code: string) => {
    if (code !== value) onChange(code);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const selectedIndex = results.findIndex((r) => r.code === value);
    setActiveIndex(query ? 0 : Math.max(0, selectedIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) choose(item.code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected ? selected.label : value}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={`w-full flex items-center justify-between gap-1.5 bg-slate-900 border rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white text-left cursor-pointer focus:outline-none ${triggerClassName}`}
      >
        <span className="truncate">
          {selected?.flag ? `${selected.flag} ` : ''}
          {selected ? selected.label : value}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute z-50 top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} w-[min(17rem,calc(100vw-2rem))] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden`}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-800">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={`Search ${label}`}
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={results[activeIndex] ? `${listId}-${results[activeIndex].code}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Type a language…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="max-h-[min(18rem,55vh)] overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-slate-400">No language matches “{query}”.</li>
            )}
            {results.map((item, index) => {
              const isSelected = item.code === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={item.code}
                  id={`${listId}-${item.code}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item.code)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer ${
                    isActive ? 'bg-sky-500/15 text-white' : 'text-slate-200'
                  }`}
                >
                  <span className="w-5 shrink-0 text-center">{item.flag || ''}</span>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-semibold">{item.label}</span>
                    {item.nativeName && <span className="text-slate-400"> · {item.nativeName}</span>}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
