import React from 'react';
import type { PageEntry } from '../core/types';

/** Placeholder shown while a page's real geometry is still being discovered. */
export const PageSkeleton: React.FC<{ entry: PageEntry; zoom: number }> = ({ entry, zoom }) => (
  <div className="relative mx-auto my-4 flex justify-center" data-page-index={entry.index}>
    <div
      className="pm-page-shadow pm-skeleton relative bg-ink-800"
      style={{ width: 612 * zoom, height: 792 * zoom }}
    >
      <div className="absolute inset-6 rounded border border-white/5" />
      <div className="absolute left-6 top-6 h-3 w-2/5 rounded bg-white/5" />
      <div className="absolute left-6 top-14 h-2 w-3/5 rounded bg-white/5" />
      <div className="absolute left-6 top-20 h-2 w-1/2 rounded bg-white/5" />
    </div>
  </div>
);
