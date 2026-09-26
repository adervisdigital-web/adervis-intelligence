import {
  checkUrl, extractContacts, mergeContacts, normalizePhone, parseYandexOrgs, yandexUrl, yandexError
} from '../supabase/functions/prospect/compose.ts';

let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (extra ? '  -> ' + extra : '')); };
const throws = fn => { try { fn(); return null; } catch (e) { return e.message; } };

// --- какие адреса сервер согласится открыть
check('адрес без протокола получает https', checkUrl('coffee-perm.ru').href === 'https://coffee-perm.ru/');
check('обычная ссылка проходит', checkUrl('http://www.coffee-perm.ru/about?x=1#top').href === 'http://www.coffee-perm.ru/about?x=1');
check('localhost отклоняется', throws(() => checkUrl('http://localhost:3000')) !== null);
check('IP-адрес отклоняется', /IP/.test(throws(() => checkUrl('http://169.254.169.254/latest')) || ''));
check('IPv6 отклоняется', throws(() => checkUrl('http://[::1]/')) !== null);
check('внутреннее имя отклоняется', throws(() => checkUrl('http://db.internal/')) !== null);
check('имя без точки отклоняется', throws(() => checkUrl('http://intranet/')) !== null);
check('file:// отклоняется', throws(() => checkUrl('file:///etc/passwd')) !== null);
check('логин в адресе отклоняется', throws(() => checkUrl('https://user:pass@site.ru')) !== null);
check('нестандартный порт отклоняется', throws(() => checkUrl('https://site.ru:8080/')) !== null);
check('пустой адрес — подсказка', /Укажите/.test(throws(() => checkUrl('  ')) || ''));

// --- телефоны в одном виде
check('8 и +7 приводятся к одному виду', normalizePhone('8 (342) 200-10-20') === '+7 (342) 200-10-20' && normalizePhone('+73422001020') === '+7 (342) 200-10-20');
check('мобильный без кода страны', normalizePhone('9021234567') === '+7 (902) 123-45-67');
check('мусор — пусто', normalizePhone('12') === '');

// --- контакты со страницы
const html = `<html><head><title>Кофейня «Зерно» — Пермь</title>
<meta name="description" content="Кофе и десерты в центре Перми">
<script>var mail = "tracker@sentry.io"</script></head><body>
<a href="/kontakty">Контакты</a>
<a href="tel:+7 (342) 200-10-20">Позвонить</a>
<p>Пишите: hello@zerno-perm.ru или звоните 8 902 123 45 67</p>
<a href="mailto:Hello@Zerno-Perm.ru?subject=Заказ">Почта</a>
<img src="logo@2x.png">
<a href="https://vk.com/zerno_perm/">ВК</a>
<a href="http://t.me/zernoperm">Telegram</a>
<a href="https://vk.com/share.php?url=https://zerno-perm.ru">Поделиться</a>
<a href="https://www.youtube.com/@zerno">YouTube</a>
</body></html>`;
const c = extractContacts(html, new URL('https://zerno-perm.ru/'));
check('название сайта', c.title === 'Кофейня «Зерно» — Пермь', c.title);
check('описание из meta', c.description === 'Кофе и десерты в центре Перми');
check('почта найдена один раз, в нижнем регистре', c.emails.join() === 'hello@zerno-perm.ru', c.emails.join());
check('почта из скриптов и картинки не попадает', !c.emails.some(e => /sentry|png/.test(e)));
check('телефоны из ссылки и текста', c.phones.join() === '+7 (342) 200-10-20,+7 (902) 123-45-67', c.phones.join());
check('соцсети компании найдены', c.socials.join() === 'https://vk.com/zerno_perm,https://t.me/zernoperm,https://www.youtube.com/@zerno', c.socials.join());
check('кнопка «поделиться» — не соцсеть компании', !c.socials.some(s => /share/.test(s)));
check('найдена страница контактов на том же сайте', c.contactsUrl === 'https://zerno-perm.ru/kontakty', c.contactsUrl);
const portfolio = extractContacts(`<header><a href="https://t.me/zernoperm">TG</a></header>
  <main><a href="https://vk.com/client_one">Кейс</a><a href="https://vk.com/client_two">Кейс</a><a href="https://vk.com/id254553435">Автор</a></main>
  <footer><a href="https://vk.com/zerno_perm">ВК</a><a href="https://vk.com/zerno_perm_2">ВК 2</a></footer>`, new URL('https://zerno-perm.ru/'));
check('соцсети берутся из шапки и подвала, а не из портфолио',
  portfolio.socials.join() === 'https://t.me/zernoperm,https://vk.com/zerno_perm', portfolio.socials.join());
check('личная страница ВК не собирается', !extractContacts('<a href="https://vk.com/id254553435">x</a>', new URL('https://a.ru/')).socials.length);
const foreign =extractContacts('<a href="https://other.ru/contacts">Контакты</a>', new URL('https://zerno-perm.ru/'));
check('чужой сайт как страницу контактов не открываем', foreign.contactsUrl === '');
const merged = mergeContacts(c, { ...c, emails: ['order@zerno-perm.ru', 'hello@zerno-perm.ru'], phones: [] });
check('контакты двух страниц сливаются без повторов', merged.emails.join() === 'hello@zerno-perm.ru,order@zerno-perm.ru', merged.emails.join());

// --- поиск организаций Яндекса
const orgs = parseYandexOrgs({ features: [
  { properties: { CompanyMetaData: { id: '1124715036', name: 'Зерно', address: 'Пермь, ул. Ленина, 50',
    url: 'https://zerno-perm.ru', Phones: [{ formatted: '+7 (342) 200-10-20' }],
    Categories: [{ name: 'Кофейня' }, { name: 'Кондитерская' }], Hours: { text: 'ежедневно, 8:00–22:00' } } } },
  { properties: { CompanyMetaData: { id: '2', name: 'Без сайта' } } },
  { properties: {} }
] });
check('организации разобраны, пустые отброшены', orgs.length === 2, String(orgs.length));
check('поля организации', orgs[0].name === 'Зерно' && orgs[0].category === 'Кофейня, Кондитерская'
  && orgs[0].phone === '+7 (342) 200-10-20' && orgs[0].external_id === '1124715036', JSON.stringify(orgs[0]));
check('без сайта и телефона — пустые строки', orgs[1].website === '' && orgs[1].phone === '');
check('без ключа — понятная ошибка', /YANDEX_ORG_API_KEY/.test(throws(() => yandexUrl('кофейня', 'Пермь')) || ''));
check('слишком короткий запрос отклоняется', /Опишите/.test(throws(() => yandexUrl('к', '', 'k')) || ''));
const yu = new URL(yandexUrl('кофейня', 'Пермь', 'k'));
check('запрос к организациям', yu.searchParams.get('type') === 'biz' && yu.searchParams.get('text') === 'кофейня Пермь');
check('ошибка ключа объясняется', /ключ/.test(yandexError(403)));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
