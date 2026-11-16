import EmbeddedPostgres from 'embedded-postgres';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const VITE_PORT = 5173;

dotenv.config({ path: path.join(projectRoot, '.env') });

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function assertPortAvailable(port, label) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      throw new Error(
        `${label} port ${port} is already in use. Stop the other process using that port, then run npm run dev:local again.`,
      );
    }
    throw error;
  }
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
}

const databasePort = await getAvailablePort();
const apiPort = Number(process.env.PORT || 3001);
const databasePassword = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(os.tmpdir(), `aurelia-local-${process.pid}-${randomUUID()}`),
  user: 'postgres',
  password: databasePassword,
  port: databasePort,
  persistent: false,
  autoRehydrateSymlinks: true,
  onLog: () => {},
  onError: (error) => console.error('Local PostgreSQL:', error),
});

let server;
let pool;
let viteProcess;
let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (viteProcess && !viteProcess.killed) viteProcess.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  await postgres.stop();
}

try {
  await assertPortAvailable(apiPort, 'API');
  await assertPortAvailable(VITE_PORT, 'Vite');

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('aurelia_local');

  process.env.DATABASE_URL = `postgresql://postgres:${databasePassword}@127.0.0.1:${databasePort}/aurelia_local`;
  process.env.DATABASE_SSL = 'false';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.JWT_SECRET ||= randomBytes(32).toString('hex');

  const mapboxConfigured = Boolean(
    process.env.MAPBOX_TOKEN && !String(process.env.MAPBOX_TOKEN).startsWith('replace-with'),
  );

  const { app, initializeDatabase, pool: databasePool } = await import('./index.js');
  pool = databasePool;
  await initializeDatabase();
  server = app.listen(apiPort, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        reject(new Error(
          `API port ${apiPort} is already in use. Stop the other process using that port, then run npm run dev:local again.`,
        ));
        return;
      }
      reject(error);
    });
  });

  console.log(`Aurelia local app: http://localhost:${VITE_PORT}`);
  console.log(`API (use via /api proxy): http://127.0.0.1:${apiPort}`);
  console.log(`Mapbox address suggestions: ${mapboxConfigured ? 'configured' : 'not configured'}`);
  console.log('Temporary local PostgreSQL is running; its data is removed on exit.');

  viteProcess = spawn(process.execPath, [
    path.resolve(projectRoot, 'node_modules/vite/bin/vite.js'),
    '--host',
    '0.0.0.0',
    '--port',
    String(VITE_PORT),
    '--strictPort',
  ], {
    cwd: projectRoot,
    env: { ...process.env, VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
    stdio: 'inherit',
  });
  viteProcess.once('exit', (code) => {
    if (!isShuttingDown) {
      process.exitCode = code || 0;
      void shutdown();
    }
  });

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
} catch (error) {
  console.error('Local development startup failed:', error.message || error);
  await shutdown();
  process.exitCode = 1;
}
