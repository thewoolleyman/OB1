// Per-source canonical "open the original" URL derivation for thought
// rows. Centralizes the per-source field lookup so every dashboard-next
// render path surfaces source URLs identically.
//
// The discriminator is `metadata.source` (per the openbrain
// SPECIFICATION/spec.md § Architecture principles "single thoughts
// table, source in metadata"). The field names per source are
// authoritative in SPECIFICATION/contracts.md:
//
//   - gmail    → gmail_rfc822_msgid (rendered as
//                https://mail.google.com/mail/u/0/#search/rfc822msgid:<id>,
//                a folder-independent, mobile-reliable deep link;
//                openbrain li-jlahbz). Falls back to gmail_thread_id
//                (#inbox/<thread-id>, desktop-web-only) for rows
//                ingested before the Message-ID was captured.
//   - gdrive   → gdrive_web_view_link (the Drive API webViewLink stored
//                verbatim by the drive ingestor)
//   - obsidian → vault_path (rendered as obsidian://open?path=<encoded>)
//   - manual / ingest-thought → metadata.source_url if the operator
//                supplied one at ingest time
//
// Returns null when no derivable URL exists, so the caller can render
// nothing rather than a broken anchor. ob-wd4.

export interface SourceUrl {
  url: string;
  label: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getSourceUrl(
  metadata: Record<string, unknown> | null | undefined,
): SourceUrl | null {
  if (!metadata) return null;
  const source = asString(metadata.source);
  if (!source) {
    // Manual / legacy rows may store source_url even without a source
    // marker; surface that path too.
    const url = asString(metadata.source_url);
    return url ? { url, label: "Open original" } : null;
  }

  switch (source) {
    case "gmail": {
      // Prefer a deep link built from the RFC822 Message-ID header
      // (metadata.gmail_rfc822_msgid; openbrain li-jlahbz). The legacy
      // `#inbox/<thread-id>` hash-fragment route resolves on desktop
      // web but the Gmail Android app / mobile web drops the fragment
      // and lands on the inbox root rather than the message. Gmail's
      // documented `rfc822msgid:` search operator resolves the message
      // across desktop and mobile, independent of folder. The header is
      // stored verbatim with angle brackets; strip them, then encode
      // the whole `rfc822msgid:<id>` token for the search fragment.
      const rfc822 = asString(metadata.gmail_rfc822_msgid);
      if (rfc822) {
        const bare = rfc822.replace(/^<|>$/g, "");
        return {
          url: `https://mail.google.com/mail/u/0/#search/${
            encodeURIComponent(`rfc822msgid:${bare}`)
          }`,
          label: "Open in Gmail",
        };
      }
      // Fallback for rows ingested before gmail_rfc822_msgid capture
      // (pre-v083 / not yet backfilled): the thread-id URL still opens
      // the message on desktop web.
      const threadId = asString(metadata.gmail_thread_id);
      if (!threadId) return null;
      return {
        url: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`,
        label: "Open in Gmail",
      };
    }
    case "gdrive": {
      const webViewLink = asString(metadata.gdrive_web_view_link);
      return webViewLink ? { url: webViewLink, label: "Open in Drive" } : null;
    }
    case "obsidian": {
      const vaultPath = asString(metadata.vault_path);
      if (!vaultPath) return null;
      return {
        url: `obsidian://open?path=${encodeURIComponent(vaultPath)}`,
        label: "Open in Obsidian",
      };
    }
    default: {
      // ingest-thought / unknown sources: honor an explicit source_url
      // if the operator supplied one; otherwise nothing to surface.
      const url = asString(metadata.source_url);
      return url ? { url, label: "Open original" } : null;
    }
  }
}
