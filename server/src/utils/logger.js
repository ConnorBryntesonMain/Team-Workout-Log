import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOG_DIR = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const stream = fs.createWriteStream(path.join(LOG_DIR, 'auth.log'), { flags: 'a' });

export function logEvent(event, details = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  });
  stream.write(line + '\n');
  if (process.env.NODE_ENV !== 'test') console.log(line);
}

// Pulls the useful request metadata in one place
export function reqInfo(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}