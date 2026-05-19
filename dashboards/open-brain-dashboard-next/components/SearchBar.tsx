"use client";

import { useState, useCallback } from "react";

export function SearchBar({
  onSearch,
  initialQuery = "",
  placeholder = "Search your thoughts...",
}: {
  onSearch: (query: string) => void;
  initialQuery?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) onSearch(query.trim());
    },
    [query, onSearch]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 bg-bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30 transition"
        />
        <button
          type="submit"
          className="px-5 py-2.5 bg-violet hover:bg-violet-dim text-white font-medium rounded-lg transition-colors"
        >
          Search
        </button>
      </div>
    </form>
  );
}
