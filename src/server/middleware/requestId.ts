import { randomUUID } from 'crypto';

export function requestId() {
  return (req: any, res: any, next: any) => {
    const id = randomUUID();
    // attach to req and response header
    (req as any).id = id;
    res.setHeader('x-request-id', id);
    next();
  };
}

