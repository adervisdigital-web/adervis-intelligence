# Иконки ADERVIS

Единый набор для всех продуктов: сайт, CRM, Stock, Intelligence. До него у
каждого продукта был свой: на сайте контур толщиной 1,6 на пяти разных
сетках, в CRM больше половины заливочных на сетке 16, в Stock — Font Awesome,
здесь — свой набор, нарисованный вручную.

Основа — [Phosphor Icons](https://phosphoricons.com), MIT, © 2023 Phosphor Icons
(текст лицензии — `LICENSE-phosphor.txt`). Сетка 256, цвет от текста.

## Два веса

- `имя.svg` — обычное состояние, контур
- `имя-fill.svg` — нажатое и выбранное, заливка той же формы

## Как поставить в продукт

Спрайт подключается один раз, дальше иконка — одна строка:

```html
<!-- один раз, в начале body -->
<div hidden>…содержимое sprite.svg…</div>

<svg class="icon" width="20" height="20"><use href="#ai-home"/></svg>
<svg class="icon" width="20" height="20"><use href="#ai-home-fill"/></svg>
```

```css
.icon { fill: currentColor; }
```

Размеры: 16 в строке текста, 20 в меню, 24–26 в карточках, 32 в крупных блоках.
Цвет всегда от текста или от продукта — отдельно иконки не красим.

Знаки площадок, которых нет в наборе (VK и другие), берутся из их
официальных брендбуков и не перерисовываются.

## Словарь

### Разделы приложений

- `home` — Обзор
- `money` — Деньги
- `ads` — Реклама
- `leads` — Заявки
- `decisions` — Решения
- `chain` — Связи
- `knowledge` — База знаний
- `brand` — Брендбук
- `products` — Продукты
- `cases` — Кейсы
- `content` — Контент
- `calendar` — Календарь
- `assistant` — ИИ-помощник
- `analytics` — Аналитика
- `competitors` — Конкуренты
- `tasks` — Задачи
- `roadmap` — Развитие
- `settings` — Настройки
- `clients` — Клиенты
- `deals` — Сделки
- `estimate` — Смета
- `contract` — Договор
- `proposal` — КП
- `portal` — Кабинет клиента
- `admin` — Админ-панель
- `notify` — Уведомления

### Услуги студии

- `video` — Видео
- `photo` — Фото
- `design` — Дизайн
- `ai` — ИИ-контент
- `animation` — Анимация
- `shooting` — Съёмка
- `editing` — Монтаж
- `grading` — Цветокоррекция
- `sound` — Звук
- `voice` — Озвучка
- `script` — Сценарий
- `logo` — Логотип
- `identity` — Фирменный стиль
- `print` — Полиграфия
- `event` — Мероприятие
- `packshot` — Предметная съёмка
- `portrait` — Портрет
- `place` — Локация
- `social` — Соцсети
- `website` — Сайты
- `slides` — Презентация

### Действия

- `plus` — Создать
- `search` — Поиск
- `refresh` — Обновить
- `menu` — Меню
- `theme` — Тема
- `close` — Закрыть
- `edit` — Изменить
- `delete` — Удалить
- `copy` — Скопировать
- `download` — Скачать
- `upload` — Загрузить
- `link` — Ссылка
- `send` — Отправить
- `share` — Поделиться
- `play` — Воспроизвести
- `next` — Дальше
- `back` — Назад
- `external` — Открыть отдельно
- `logout` — Выйти
- `filter` — Отбор
- `sort` — Сортировка
- `more` — Ещё
- `expand` — Раскрыть

### Состояния

- `check` — Готово
- `success` — Успех
- `warn` — Внимание
- `error` — Ошибка
- `info` — Справка
- `loading` — Загрузка
- `time` — Сроки
- `lock` — Внутреннее
- `eye` — Публичное
- `hidden` — Скрыто
- `key` — Доступ
- `star` — Отзыв
- `fast` — Быстро

### Деньги и документы

- `income` — Поступление
- `expense` — Расход
- `card` — Оплата
- `invoice` — Счёт
- `gift` — Бонус
- `file` — Файл
- `pdf` — PDF
- `folder` — Папка

### Связь

- `mail` — Почта
- `phone` — Телефон
- `chat` — Сообщение
- `telegram` — Telegram
- `youtube` — YouTube
- `behance` — Behance
- `google` — Google
