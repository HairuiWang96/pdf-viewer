import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfAttachment } from './attachments';

/**
 * Where one attachment is between "we know it exists" and "you can play it".
 *
 * `idle` is the resting state and the one almost every attachment stays in —
 * the indicator has done its job without a byte being read.
 */
export type AttachmentUrlState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'failed' };

export interface AttachmentUrl {
  state: AttachmentUrlState;
  /** Reads the bytes if they have not been read, and returns the blob URL. */
  load: () => Promise<string | null>;
}

/**
 * One shared value, so that resetting an already-idle hook is a no-op.
 *
 * React bails out of a re-render when setState is given the state it already
 * holds, and that comparison is by identity — a fresh `{ status: 'idle' }`
 * would fail it and render again. That matters because the reset below runs
 * whenever the attachment's identity changes: with a caller that rebuilds its
 * attachments each render, a new object here would mean reset, render, reset,
 * for as long as the component is mounted.
 */
const IDLE: AttachmentUrlState = { status: 'idle' };

/**
 * Owns the blob URL for a single attachment: creates it on demand, and is the
 * only thing that revokes it.
 *
 * Failing to revoke is invisible — nothing breaks and nothing logs, memory
 * just climbs for the life of the tab — and an attachment can be very large,
 * so the URL is tied to this hook's lifetime and released when the component
 * unmounts or the attachment changes.
 *
 * `attachment` should be referentially stable for as long as it is the same
 * file: a new identity means the loaded file is released and the control goes
 * back to its resting state, which a caller rebuilding the object every render
 * would trigger constantly. useAttachments returns a stable list per document,
 * which is what makes this hold in practice.
 */
export function useAttachmentUrl(attachment: PdfAttachment): AttachmentUrl {
  const [state, setState] = useState<AttachmentUrlState>(IDLE);

  // The URL this hook created, held in a ref so the cleanup can revoke it
  // without the effect having to depend on state and re-run.
  const urlRef = useRef<string | null>(null);
  // The read in flight, so a double click reads once rather than twice — which
  // for a large attachment would be two downloads and two copies in memory.
  const pendingRef = useRef<Promise<string | null> | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      pendingRef.current = null;
      setState(IDLE);
    },
    [attachment],
  );

  const load = useCallback(() => {
    if (urlRef.current) return Promise.resolve(urlRef.current);
    if (pendingRef.current) return pendingRef.current;

    setState({ status: 'loading' });

    const pending = attachment
      .read()
      .then((bytes) => {
        const blob = new Blob([bytes as BlobPart], {
          type: attachment.mimeType ?? 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);

        // The cleanup already ran, so nothing is left to revoke this one.
        if (pendingRef.current !== pending) {
          URL.revokeObjectURL(url);
          return null;
        }

        urlRef.current = url;
        setState({ status: 'ready', url });
        return url;
      })
      .catch((error: unknown) => {
        // The indicator was right that the file is there; we just could not
        // read it. Say so in place rather than taking the view down.
        console.error(`Could not read ${attachment.filename}:`, error);
        if (pendingRef.current === pending) setState({ status: 'failed' });
        return null;
      });

    pendingRef.current = pending;
    return pending;
  }, [attachment]);

  return { state, load };
}
