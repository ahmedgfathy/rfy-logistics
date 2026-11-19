import { useEffect } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark';

/** The site is dark-only. This provider simply guarantees the class is present
 * before the app renders, so every token resolves to the dark palette. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.dataset.theme = 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111111');
  }, []);

  return <>{children}</>;
}
