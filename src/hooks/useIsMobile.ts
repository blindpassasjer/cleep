import { useEffect, useState } from 'react';

// Mirrors index.css's `@media (max-width: 760px)` breakpoint. Kept as JS too so components that
// must not merely look right but actually not render certain controls on mobile (e.g. rename/
// delete on the collapsed sidebar rail) don't have to trust CSS specificity/cascade alone.
const QUERY = '(max-width: 760px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
