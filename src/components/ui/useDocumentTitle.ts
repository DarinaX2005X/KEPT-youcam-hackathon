'use client';

import { useEffect } from 'react';

/**
 * Keeps `document.title` at `title` while mounted. Next applies route metadata after client
 * navigation, sometimes after this component's effects ran, so a later change of the <title>
 * element is put back. Pass undefined to leave the title alone (e.g. while the name loads).
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
