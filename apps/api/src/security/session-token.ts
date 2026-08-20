import { createHash, randomBytes } from 'node:crypto';
import type { SessionTokenCodec } from '@qc/domain';

export function createSessionTokenCodec(): SessionTokenCodec {
  return {
    generate() {
      return randomBytes(32).toString('base64url');
    },
    hash(rawToken) {
      return createHash('sha256').update(rawToken, 'utf8').digest('hex');
    },
  };
}
