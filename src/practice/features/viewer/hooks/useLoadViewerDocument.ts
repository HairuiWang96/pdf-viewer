// Practice copy of the other project's useLoadViewerDocument. TanStack Query
// runs the loader (cancelling it when the id changes) and reports its status;
// the results themselves go into the viewer store.
//
// Changed from the original: imports loadViewerDocument (was the
// loadDocumentVierwer typo).
import { skipToken, useQuery } from '@tanstack/react-query';
import { loadViewerDocument } from '../api/loadViewerDocument';

export function useLoadViewerDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['viewer-load', id],
    queryFn: id ? ({ signal }) => loadViewerDocument(id, signal) : skipToken,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
