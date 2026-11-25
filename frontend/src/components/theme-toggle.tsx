'use client';

import { useEffect, useState } from 'react';

type Choice = 'light' | 'dark' | 'system';
const KEY = 'vgp-theme';

function apply(choice: Choice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

const OPTIONS: { value: Choice; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

/** Light / Dark / System switch. The choice is remembered on this device. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    let saved: Choice = 'system';
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') saved = v;
    } catch {}
    setChoice(saved);
    // Follow the device setting live while on "System".
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      let current: Choice = 'system';
      try {
        current = (localStorage.getItem(KEY) as Choice) || 'system';
      } catch {}
      if (current === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const pick = (c: Choice) => {
    setChoice(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    apply(c);
  };

  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-md border border-line bg-card p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          title={`${o.label} theme`}
          onClick={() => pick(o.value)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${choice === o.value ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
        >
          {o.icon}
          <span className="hidden md:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
