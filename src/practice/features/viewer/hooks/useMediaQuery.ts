import { useEffect, useState } from 'react';

// Tracks whether the browser viewport currently matches the supplied CSS media query.
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  // Subscribe whenever the query changes so responsive UI updates without a page reload.
  useEffect(() => {
    const media = window.matchMedia(query);

    // Copy the latest browser match state into React when the media query changes.
    const handleChange = () => {
      setMatches(media.matches);
    };

    media.addEventListener('change', handleChange);

    // Remove the browser listener before changing queries or unmounting the component.
    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
