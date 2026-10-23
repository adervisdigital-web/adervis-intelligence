// Выбор клиента на странице КП → проверенная сумма по снимку КП.
export const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

// deno-lint-ignore no-explicit-any
type Row = any;

// Индексы опций берём только из снимка, всё остальное отбрасываем.
export function choiceOf(data: Row, body: Row) {
  const e = data?.estimate ?? {};
  const variant = e.two && body?.variant === 'base' ? 'base' : 'full';
  const price = Number(variant === 'base' ? e.base : e.full) || 0;
  const all = Array.isArray(e.options) ? e.options : [];
  const picked = [...new Set((Array.isArray(body?.options) ? body.options : []).map(Number))]
    .filter(i => Number.isInteger(i) && i >= 0 && i < all.length).sort((a, b) => a - b);
  const options = picked.map(i => ({ name: String(all[i].name ?? ''), price: Number(all[i].price) || 0 }));
  const total = price + options.reduce((n, o) => n + o.price, 0);
  const label = e.two ? (variant === 'base' ? 'Базовый вариант' : 'Полный вариант') : 'Смета';
  const comment = String(body?.comment ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  return { variant, label, price, options, total, comment };
}

// «Предложить свой бюджет»: из ввода берём только цифры, разумные пределы.
export function budgetOf(data: Row, body: Row) {
  const amount = Math.round(Number(String(body?.amount ?? '').replace(/[^\d]/g, '')) || 0);
  if (amount < 1000 || amount > 1_000_000_000) return null;
  const e = data?.estimate ?? {};
  const ours = Number(e.two ? e.base : e.full) || 0;
  return { type: 'budget', amount, ours, from: !!e.two };
}
