import { describe, it, expect } from 'vitest';
import { isSafari } from './isSafari';

/**
 * Tests for isSafari, with real user-agent strings from each browser. "Safari"
 * here means Safari's engine, WebKit, which every iPhone and iPad browser uses.
 */
const userAgents = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  firefoxIPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  firefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
};

describe('isSafari', () => {
  it('recognises Safari on Mac and iPhone', () => {
    expect(isSafari(userAgents.safariMac)).toBe(true);
    expect(isSafari(userAgents.safariIPhone)).toBe(true);
  });

  it('counts Chrome and Firefox on iPhone, which run on Safari’s engine', () => {
    expect(isSafari(userAgents.chromeIPhone)).toBe(true);
    expect(isSafari(userAgents.firefoxIPhone)).toBe(true);
  });

  it('doesn’t mistake Chrome or Edge for Safari, though they say "Safari/"', () => {
    expect(isSafari(userAgents.chrome)).toBe(false);
    expect(isSafari(userAgents.edge)).toBe(false);
    expect(isSafari(userAgents.chromeAndroid)).toBe(false);
  });

  it('doesn’t mistake desktop Firefox for Safari', () => {
    expect(isSafari(userAgents.firefox)).toBe(false);
  });
});
