// Proposed, not in doc-viewer yet: tells the viewer to keep Kendo's own print
// in Firefox (see PDFDocViewer).
//
// Read from the user-agent string, as MDN's browser-detection guide says:
// Firefox "must contain Firefox/xyz" and "must not contain Seamonkey/xyz".
// Firefox-based browsers (LibreWolf, Waterfox) match too, which is wanted:
// they share Firefox's PDF settings. Firefox on iPhone says "FxiOS" and runs
// on Safari's engine, so it rightly doesn't match.
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent
export function isFirefox(userAgent = navigator.userAgent) {
  return /Firefox\//.test(userAgent) && !/Seamonkey\//i.test(userAgent);
}
