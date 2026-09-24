// Собирает серверную функцию в один файл, который можно вставить в панель
// Supabase (Edge Functions → Deploy a new function), не пользуясь Docker и CLI.
//
// Запуск:  node tools/bundle.mjs
// Результат: supabase/functions/ai-write/bundle.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');
const names = process.argv[2] ? [process.argv[2]]
  : fs.readdirSync(root).filter(n => fs.existsSync(path.join(root, n, 'compose.ts')));

for (const name of names) build(path.join(root, name));

function build(dir) {
const compose = fs.readFileSync(path.join(dir, 'compose.ts'), 'utf8');
const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');

// Убираем только строку импорта соседнего файла: всё остальное, включая импорт
// supabase-js, должно остаться.
const lines = index.split('\n');
const localImport = lines.filter(l => /from\s*'\.\/compose\.ts'/.test(l));
if (localImport.length !== 1) throw new Error('Ожидалась одна строка импорта compose.ts, найдено: ' + localImport.length);
const rest = lines.filter(l => !/from\s*'\.\/compose\.ts'/.test(l));
// Внешние импорты выносим в начало файла, чтобы читалось как обычный модуль.
const externalImports = rest.filter(l => /^import\s/.test(l));
const withoutLocalImport = rest.filter(l => !/^import\s/.test(l)).join('\n');

const out = [
  '// ВНИМАНИЕ: файл собран автоматически из compose.ts и index.ts.',
  '// Правьте те файлы и пересоберите: node tools/bundle.mjs',
  '',
  externalImports.join('\n'),
  '',
  compose.trim(),
  '',
  withoutLocalImport.trim(),
  ''
].join('\n');

fs.writeFileSync(path.join(dir, 'bundle.ts'), out);
console.log(path.basename(dir) + '/bundle.ts собран,', Buffer.byteLength(out), 'байт');
}
