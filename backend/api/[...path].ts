import { createApp } from '../src/app';

const app = createApp();

// Vercel routes every /api/* request to this function and preserves the
// original path, so Express matches the same routes it serves locally.
export default function handler(req: any, res: any) {
  return app(req, res);
}
