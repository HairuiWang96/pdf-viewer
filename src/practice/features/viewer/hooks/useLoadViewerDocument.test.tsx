import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLoadViewerDocument } from './useLoadViewerDocument';
import { loadViewerDocument, DocumentNotFoundError } from '../api/loadViewerDocument';

/**
 * Tests for the query hook: that it runs the loader for an id, skips it with
 * no id, and reports a failure as an error. The loader itself is mocked; it has
 * its own suite.
 */

vi.mock('../api/loadViewerDocument', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/loadViewerDocument')>()),
  loadViewerDocument: vi.fn(),
}));
const loadMock = vi.mocked(loadViewerDocument);

// A fresh client per test, so no result carries over
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useLoadViewerDocument', () => {
  beforeEach(() => {
    loadMock.mockReset();
  });

  it('runs the loader for the id, with a signal to cancel it', async () => {
    loadMock.mockResolvedValue([{ caseNumber: 'CASE-001' }]);

    const { result } = renderHook(() => useLoadViewerDocument('doc-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(loadMock).toHaveBeenCalledWith('doc-1', expect.any(AbortSignal));
  });

  it('does not run the loader while there is no id', () => {
    const { result } = renderHook(() => useLoadViewerDocument(undefined), { wrapper });

    expect(loadMock).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it('reports a missing document as an error, without retrying', async () => {
    loadMock.mockRejectedValue(new DocumentNotFoundError());

    const { result } = renderHook(() => useLoadViewerDocument('doc-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(DocumentNotFoundError);
    expect(loadMock).toHaveBeenCalledTimes(1);
  });
});
