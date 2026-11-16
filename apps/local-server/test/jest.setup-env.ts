import { randomBytes } from 'crypto';

// R0 / S7: there is no fixed secret anywhere in the repository.
// Each Jest run gets an ephemeral random JWT secret unless one is provided.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = `test-only-${randomBytes(32).toString('hex')}`;
}
