import { useBlocker } from '@tanstack/react-router';

/** Keep local edits from silently disappearing when a sidebar changes material or page. */
export function useDraftGuard(dirty: boolean) {
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm('Ada perubahan belum tersimpan. Tinggalkan perubahan dan buka halaman lain?'),
    enableBeforeUnload: dirty,
  });
}
