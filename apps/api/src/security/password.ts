import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '@qc/domain';

export interface ArgonPasswordHasherOptions {
  pepper: string;
  memoryCostKiB?: number;
  timeCost?: number;
  parallelism?: number;
}

export function createArgonPasswordHasher(options: ArgonPasswordHasherOptions): PasswordHasher {
  const material = (password: string) => `${password}\u0000${options.pepper}`;

  return {
    hash(password) {
      return hash(material(password), {
        algorithm: Algorithm.Argon2id,
        memoryCost: options.memoryCostKiB ?? 19_456,
        timeCost: options.timeCost ?? 2,
        parallelism: options.parallelism ?? 1,
        outputLen: 32,
      });
    },
    verify(passwordHash, password) {
      return verify(passwordHash, material(password));
    },
  };
}
