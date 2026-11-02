import { describe, it, expect } from 'vitest';
import { isFirefox } from './isFirefox';

/**
 * Tests for isFirefox, with real user-agent strings from each browser.
 */
const userAgents = {
  firefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  // Firefox on iPhone runs on Safari's engine
  firefoxIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  // SeaMonkey 2.53.19 reports Gecko/Firefox 91, its "base user agent version"
  // (release notes), alongside its own version
  seamonkey:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0 SeaMonkey/2.53.19',
};

describe('isFirefox', () => {
  it('recognises Firefox on Windows and Linux', () => {
    expect(isFirefox(userAgents.firefox)).toBe(true);
    expect(isFirefox(userAgents.firefoxLinux)).toBe(true);
  });

  it('doesn’t mistake Chrome, Edge or Safari for Firefox', () => {
    // Their strings say "like Gecko", but never "Firefox/"
    expect(isFirefox(userAgents.chrome)).toBe(false);
    expect(isFirefox(userAgents.edge)).toBe(false);
    expect(isFirefox(userAgents.safari)).toBe(false);
  });

  it('leaves out Firefox on iPhone, which is Safari underneath', () => {
    expect(isFirefox(userAgents.firefoxIOS)).toBe(false);
  });

  it('leaves out SeaMonkey, which also says "Firefox/"', () => {
    expect(isFirefox(userAgents.seamonkey)).toBe(false);
  });

  it('reads the browser’s own user agent by default', () => {
    // jsdom's says "jsdom", not Firefox
    expect(isFirefox()).toBe(false);
  });
});
