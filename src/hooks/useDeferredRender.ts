import { useEffect, useRef, useState } from 'react';

interface UseDeferredRenderOptions {
  enabled?: boolean;
  observe?: boolean;
  timeoutMs?: number;
  rootMargin?: string;
}

export function useDeferredRender({
  enabled = true,
  observe = false,
  timeoutMs = 600,
  rootMargin = '240px',
}: UseDeferredRenderOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setIsReady(true);
      return;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || isReady || typeof window === 'undefined') return;

    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    let observer: IntersectionObserver | null = null;

    const activate = () => {
      if (!cancelled) setIsReady(true);
    };

    timeoutId = window.setTimeout(activate, timeoutMs);

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(() => activate(), { timeout: timeoutMs });
    }

    if (observe && typeof IntersectionObserver === 'function' && ref.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activate();
            observer?.disconnect();
          }
        },
        { rootMargin },
      );
      observer.observe(ref.current);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (idleId !== undefined && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
      observer?.disconnect();
    };
  }, [enabled, isReady, observe, rootMargin, timeoutMs]);

  return { ref, isReady };
}
