import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadViewerDocument, DocumentNotFoundError } from './loadViewerDocument';
import { fetchDocumentDetails } from './fetchDocumentDetails';
import { extractAttachments } from '../utils/extractAttachments';
import { createCaseStamp } from '../utils/caseStamp';
import { useViewerStore } from '../data/viewerStore';
import type { DocumentDetailsData } from '../types/document';

/**
 * Tests for the document loader: what it puts in the store for one case and
 * for several, when it reports "not found", and that a load for a document no
 * longer on screen writes nothing. The backend, the PDF download, attachment
 * extraction and stamping are all mocked; what is under test is the order and
 * the store writes.
 */

vi.mock('./fetchDocumentDetails', () => ({ fetchDocumentDetails: vi.fn() }));
vi.mock('../utils/extractAttachments', () => ({ extractAttachments: vi.fn() }));
vi.mock('../utils/caseStamp', () => ({ createCaseStamp: vi.fn() }));

const fetchDetailsMock = vi.mocked(fetchDocumentDetails);
const extractMock = vi.mocked(extractAttachments);
const stampMock = vi.mocked(createCaseStamp);
const fetchMock = vi.fn();

const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"
const stampedBytes = new Uint8Array([1, 2, 3]);

const first: DocumentDetailsData = { caseNumber: 'CASE-001', caseName: 'First', url: '/doc.pdf' };
const second: DocumentDetailsData = { caseNumber: 'CASE-002', caseName: 'Second', url: '/doc.pdf' };

function pdfResponse(ok = true) {
  return { ok, arrayBuffer: () => Promise.resolve(pdfBytes.buffer) } as unknown as Response;
}

const state = () => useViewerStore.getState();

describe('loadViewerDocument', () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
    fetchDetailsMock.mockReset();
    extractMock.mockReset().mockResolvedValue({ list: [], readers: new Map() });
    stampMock.mockReset().mockResolvedValue(null);
    fetchMock.mockReset().mockResolvedValue(pdfResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('one case', () => {
    it('sends no case list and pre-selects the document’s own case', async () => {
      fetchDetailsMock.mockResolvedValue([first]);

      await loadViewerDocument('doc-1', new AbortController().signal);

      expect(state().cases).toEqual([]);
      expect(state().currentCaseNumber).toBe('CASE-001');
      expect(state().details).toEqual(first);
    });
  });

  describe('several cases', () => {
    it('lists the cases, selects none, and keeps every case’s details', async () => {
      fetchDetailsMock.mockResolvedValue([first, second]);

      await loadViewerDocument('doc-1', new AbortController().signal);

      expect(state().cases).toEqual([{ caseNumber: 'CASE-001' }, { caseNumber: 'CASE-002' }]);
      expect(state().currentCaseNumber).toBeUndefined();
      expect(state().allDetails).toEqual([first, second]);
    });

    it('sorts the case list by case number, ascending', async () => {
      // The backend's order is not sorted. Numbers inside compare as numbers,
      // so CASE-2 comes before CASE-10.
      fetchDetailsMock.mockResolvedValue([
        { ...first, caseNumber: 'CASE-10' },
        { ...first, caseNumber: 'CASE-2' },
        { ...first, caseNumber: 'CASE-1' },
      ]);

      await loadViewerDocument('doc-1', new AbortController().signal);

      expect(state().cases).toEqual([
        { caseNumber: 'CASE-1' },
        { caseNumber: 'CASE-2' },
        { caseNumber: 'CASE-10' },
      ]);
      // Only the dropdown list is sorted: the page still opens on the
      // backend's first entry
      expect(state().details?.caseNumber).toBe('CASE-10');
    });

    it('lets a picked case’s details be found after loading', async () => {
      // The point of passing data to initializeViewer
      fetchDetailsMock.mockResolvedValue([first, second]);
      await loadViewerDocument('doc-1', new AbortController().signal);

      state().selectCase('CASE-002');

      expect(state().details).toEqual(second);
    });
  });

  describe('the PDF', () => {
    it('downloads the PDF from the first case’s url and stores it', async () => {
      fetchDetailsMock.mockResolvedValue([first]);

      await loadViewerDocument('doc-1', new AbortController().signal);

      expect(fetchMock).toHaveBeenCalledWith('/doc.pdf', expect.anything());
      expect(state().document).toEqual(pdfBytes);
      expect(state().documentLoaded).toBe(true);
    });

    it('stores the attachments once they are extracted', async () => {
      fetchDetailsMock.mockResolvedValue([first]);
      const list = [{ name: 'a.mp3', filename: 'a.mp3' }] as never;
      extractMock.mockResolvedValue({ list, readers: new Map() });

      await loadViewerDocument('doc-1', new AbortController().signal);

      await vi.waitFor(() => expect(state().attachments).toEqual(list));
    });

    it('stores the stamped PDF once it is made', async () => {
      fetchDetailsMock.mockResolvedValue([first]);
      stampMock.mockResolvedValue(stampedBytes);

      await loadViewerDocument('doc-1', new AbortController().signal);

      await vi.waitFor(() => expect(state().stampedDocument).toEqual(stampedBytes));
    });

    it('logs a failed stamp as a stamp failure', async () => {
      // It used to say "Attachment extraction failed"
      fetchDetailsMock.mockResolvedValue([first]);
      stampMock.mockRejectedValue(new Error('boom'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await loadViewerDocument('doc-1', new AbortController().signal);

      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith('Case stamp failed: ', expect.any(Error)),
      );
      errorSpy.mockRestore();
    });
  });

  describe('not found', () => {
    it.each([
      ['null', null],
      // Got past `if (!data)` before, then crashed on data[0]
      ['an empty list', []],
    ])('throws DocumentNotFoundError when the details are %s', async (_label, data) => {
      fetchDetailsMock.mockResolvedValue(data);

      await expect(loadViewerDocument('doc-1', new AbortController().signal)).rejects.toThrow(
        DocumentNotFoundError,
      );
    });

    it('throws DocumentNotFoundError when the details have no url, without fetching', async () => {
      fetchDetailsMock.mockResolvedValue([{ caseNumber: 'CASE-001' }]);

      await expect(loadViewerDocument('doc-1', new AbortController().signal)).rejects.toThrow(
        DocumentNotFoundError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws DocumentNotFoundError when the PDF download fails', async () => {
      fetchDetailsMock.mockResolvedValue([first]);
      fetchMock.mockResolvedValue(pdfResponse(false));

      await expect(loadViewerDocument('doc-1', new AbortController().signal)).rejects.toThrow(
        DocumentNotFoundError,
      );
    });
  });

  describe('a document no longer on screen', () => {
    it('writes nothing once its load is cancelled', async () => {
      // TanStack Query aborts the signal when the id changes
      const controller = new AbortController();
      fetchDetailsMock.mockImplementation(async () => {
        controller.abort();
        return [first];
      });

      const result = await loadViewerDocument('doc-1', controller.signal);

      expect(result).toEqual([]);
      expect(state().details).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not overwrite a newer document that started meanwhile', async () => {
      fetchDetailsMock.mockImplementation(async () => {
        // Another document starts while this one's details are on their way
        useViewerStore.getState().startDocument('doc-2');
        return [first];
      });

      await loadViewerDocument('doc-1', new AbortController().signal);

      expect(state().documentId).toBe('doc-2');
      expect(state().details).toBeNull();
    });
  });
});
