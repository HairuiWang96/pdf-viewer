// Proposed, not in doc-viewer yet: tells the print button to wait before
// printing in Safari (see ToolbarPrint).
//
// Checks for Safari's engine (WebKit), not the Safari name: on iPhone and iPad
// every browser uses it (Chrome says "CriOS", Firefox "FxiOS"), so they print
// the same way. Chrome, Edge and Opera also say "AppleWebKit/" and "Safari/",
// but add "Chrome/"; MDN's rule for Safari is "must not contain Chrome/xyz or
// Chromium/xyz". iPads report themselves as a Mac, which is still WebKit.
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent
export function isSafari(userAgent = navigator.userAgent) {
  return /AppleWebKit\//.test(userAgent) && !/Chrome\/|Chromium\//.test(userAgent);
}
