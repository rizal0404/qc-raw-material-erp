import { createHash } from 'node:crypto';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function migrationChecksums(content: string): { canonical: string; legacy: string } {
  return {
    canonical: sha256(content.replace(/\r\n/g, '\n')),
    legacy: sha256(content),
  };
}

export function migrationChecksumMatches(stored: string, content: string): boolean {
  const checksums = migrationChecksums(content);
  return stored === checksums.canonical || stored === checksums.legacy;
}
