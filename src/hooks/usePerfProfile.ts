import { useEffect, useState } from 'react';

interface PerfProfile {
  isMobile: boolean;
  prefersLowMotion: boolean;
}

// Detects when we should disable heavy effects (mobile or reduced‑motion).
export function usePerfProfile(): PerfProfile {
  const [profile, setProfile] = useState<PerfProfile>(() => {
    if (typeof window === 'undefined') {
      return { isMobile: false, prefersLowMotion: false };
    }

    const mqMobile = window.matchMedia('(max-width: 768px)');
    const mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    return {
      isMobile: mqMobile.matches,
      prefersLowMotion: mqMobile.matches || mqReducedMotion.matches,
    };
  });

  useEffect(() => {
    const mqMobile = window.matchMedia('(max-width: 768px)');
    const mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      setProfile({
        isMobile: mqMobile.matches,
        prefersLowMotion: mqMobile.matches || mqReducedMotion.matches,
      });
    };

    update();
    if (typeof mqMobile.addEventListener === 'function') {
      mqMobile.addEventListener('change', update);
      mqReducedMotion.addEventListener('change', update);
    } else {
      mqMobile.addListener(update);
      mqReducedMotion.addListener(update);
    }

    return () => {
      if (typeof mqMobile.removeEventListener === 'function') {
        mqMobile.removeEventListener('change', update);
        mqReducedMotion.removeEventListener('change', update);
      } else {
        mqMobile.removeListener(update);
        mqReducedMotion.removeListener(update);
      }
    };
  }, []);

  return profile;
}
