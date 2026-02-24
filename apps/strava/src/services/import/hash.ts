import { createHash } from 'crypto';

export const sha256Hex = (buffer: Buffer): string => {
  return createHash('sha256').update(buffer).digest('hex');
};
