"use client";

import { getSourceUrl } from "@/lib/source-url";

// SourceLink — renders a small "open the original" anchor when the
// thought's metadata yields a derivable source URL; renders nothing
// otherwise (graceful no-op so the DOM never carries an empty anchor).
//
// Compact rendering by default for inline use inside thought cards and
// list rows. The optional `compact={false}` mode renders a longer
// labeled button suitable for thought detail pages. ob-wd4.

interface Props {
  metadata: Record<string, unknown> | null | undefined;
  compact?: boolean;
  className?: string;
}

export function SourceLink({ metadata, compact = true, className }: Props) {
  const link = getSourceUrl(metadata);
  if (!link) return null;

  const stop = (e: React.MouseEvent) => {
    // Stop the parent <Link> from intercepting clicks on rows that wrap
    // the entire card in a Next.js link to the detail page.
    e.stopPropagation();
  };

  if (compact) {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        title={link.label}
        aria-label={link.label}
        className={
          className ??
          "inline-flex items-center text-xs text-text-muted hover:text-violet underline-offset-2 hover:underline"
        }
      >
        {link.label}
      </a>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      className={
        className ??
        "inline-flex items-center px-3 py-1.5 rounded border border-border text-sm text-text-secondary hover:text-violet hover:border-violet/30 transition-colors"
      }
    >
      {link.label} ↗
    </a>
  );
}
