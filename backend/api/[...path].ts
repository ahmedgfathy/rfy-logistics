import { createApp } from '../src/app';

const app = createApp();

// Vercel invokes the exported default as (req, res). Express applications are
// callable request handlers, so wrapping keeps the contract explicit and avoids
// needing any Vercel-specific runtime types in the backend.
export default function handler(req: any, res: any) {
  return app(req, res);
}
