// Локальный запуск общей базы.
// Браузер не разрешает странице, открытой двойным щелчком, подгружать соседние
// файлы, поэтому нужен адрес вида http://localhost. Этот скрипт его и даёт.
//
// Запуск: node tools/serve.mjs   (или двойной щелчок по «Открыть ADERVIS Intelligence.cmd»)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const START_PORT = 8787;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);

  // Наружу отдаём только файлы приложения.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Нет доступа');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Файл не найден: ' + url);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function listen(port, attemptsLeft = 10) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('Не удалось запустить:', e.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const address = `http://localhost:${port}`;
    console.log('');
    console.log('  ADERVIS Intelligence открыт: ' + address);
    console.log('  Чтобы закрыть — закройте это чёрное окно.');
    console.log('');
    exec(`start "" "${address}"`, { shell: 'cmd.exe' });
  });
}

listen(START_PORT);
