/**
 * benchmark/mock-server.ts
 *
 * A minimal HTTP server that simulates npm registry and bundlephobia responses
 * with a fixed artificial delay so network variance does not affect benchmark
 * results. Both benchmark variants hit this server instead of the real internet.
 *
 * Registry shape:  GET /<pkg>            → RegistryPackageInfo
 * Bundlephobia:    GET /api/size?package= → BundlephobiaResult
 */

import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';

/** Fixed delay added to every response, in milliseconds. */
const RESPONSE_DELAY_MS = 150;

/** Default port the server listens on. */
export const DEFAULT_PORT = 3333;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res: ServerResponse, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';

  void (async () => {
    await delay(RESPONSE_DELAY_MS);

    // Bundlephobia endpoint: GET /api/size?package=<name>@<version>
    if (url.startsWith('/api/size')) {
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const pkg = params.get('package') ?? 'unknown@1.0.0';
      const atIdx = pkg.lastIndexOf('@');
      const name = atIdx > 0 ? pkg.slice(0, atIdx) : pkg;
      const version = atIdx > 0 ? pkg.slice(atIdx + 1) : '1.0.0';

      sendJson(res, {
        name,
        version,
        size: 12_000,
        gzip: 4_200,
      });
      return;
    }

    // npm registry endpoint: GET /<encoded-pkg-name>
    // Decode the package name (handles scoped packages like %40babel%2Fcore).
    const rawName = url.slice(1); // strip leading /
    const pkgName = decodeURIComponent(rawName) || 'fake-package';

    const now = new Date().toISOString();

    sendJson(res, {
      name: pkgName,
      'dist-tags': { latest: '2.0.0' },
      time: {
        '1.0.0': '2022-01-01T00:00:00.000Z',
        '2.0.0': now,
      },
    });
  })();
}

/**
 * Start the mock server and return it once it is listening.
 *
 * @param port - TCP port to bind (default: DEFAULT_PORT)
 */
export function startMockServer(port: number = DEFAULT_PORT): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest);

    server.once('error', reject);

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

/**
 * Gracefully close a running server.
 */
export function stopMockServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
