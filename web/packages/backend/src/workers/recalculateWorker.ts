import { parentPort, workerData } from 'node:worker_threads';
import { recalculate, type ProjectData } from '@schedulesync/engine';

const port = parentPort;

if (!port) {
  throw new Error('Scheduling worker started without a parent port.');
}

try {
  const result = recalculate(workerData as ProjectData);
  port.postMessage({ ok: true, result });
} catch (error: unknown) {
  port.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : 'Scheduling worker failed.',
  });
}
