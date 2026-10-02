import { useEffect, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'pdfmaster:theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage may be blocked */
  }
  return 'dark';
}

let theme: Theme = read();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setTheme(next: Theme): void {
  theme = next;
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  notify();
}

export function toggleTheme(): void {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

export function currentTheme(): Theme {
  return theme;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  const value = useSyncExternalStore(subscribe, currentTheme, currentTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = value;
  }, [value]);
  return value;
}

setTheme(theme);
