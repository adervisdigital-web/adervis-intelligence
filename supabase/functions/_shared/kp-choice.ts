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

// «Запросить счёт»: на кого выставить, ИНН (10 или 12 цифр, можно пусто), почта.
// Сумма — предоплата от выбранного клиентом итога, процент — из КП.
export function invoiceOf(data: Row, choice: Row, body: Row) {
  if (!choice || choice.type === 'budget' || !(Number(choice.total) > 0)) return { error: 'Сначала выберите вариант в КП' };
  const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const payer = clean(body?.payer, 200);
  const inn = String(body?.inn ?? '').replace(/\D/g, '');
  const email = clean(body?.email, 120).toLowerCase();
  if (payer.length < 2) return { error: 'Укажите компанию или ФИО, на кого выставить счёт' };
  if (inn && inn.length !== 10 && inn.length !== 12) return { error: 'ИНН — 10 цифр у компании или 12 у ИП и физлица' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Укажите почту, на которую прислать счёт' };
  const pct = Math.min(100, Math.max(1, Math.round(Number(data?.prepay) || 100)));
  const amount = Math.round(Number(choice.total) * pct / 100);
  return { payer, inn, email, pct, amount, total: Math.round(Number(choice.total)), comment: clean(body?.comment, 300) };
}
