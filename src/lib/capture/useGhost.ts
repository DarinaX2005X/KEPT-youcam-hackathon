'use client';

import { useEffect, useRef, useState } from 'react';
import { prepareGhost, type GhostGuide, type GhostInput } from './snapshot';

export type GhostStatus = 'none' | 'loading' | 'ready' | 'error';

/** Reads the day 0 outline once per ghost photo. `promise` lets a still wait for the anchors. */
export function useGhost(ghost: GhostInput | undefined) {
  const [state, setState] = useState<{ status: GhostStatus; guide: GhostGuide | null }>({ status: ghost ? 'loading' : 'none', guide: null });
  const promiseRef = useRef<Promise<GhostGuide | null>>(Promise.resolve(null));
  const key = ghost ? ('id' in ghost.photo ? `id:${ghost.photo.id}` : `url:${ghost.photo.url}`) : '';
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;

  useEffect(() => {
    const g = ghostRef.current;
    if (!g) {
      setState({ status: 'none', guide: null });
      promiseRef.current = Promise.resolve(null);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', guide: null });
    const p = prepareGhost(g)
      .then((guide) => {
        if (!cancelled) setState({ status: guide.anchors ? 'ready' : 'error', guide });
        return guide;
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', guide: null });
        return null;
      });
    promiseRef.current = p;
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { ...state, promise: promiseRef };
}
