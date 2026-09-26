-- Шрифты: все начертания, а не по одному на гарнитуру.
--
-- В хранилище лежат TT Fors Regular и Bold, Eurostile Extended Medium и
-- Black, а приложение грузило только Regular и Medium. Весь жирный текст
-- браузер рисовал сам, размазывая обычное начертание.
--
-- Плюс роли: широкий акцидентный Eurostile — только для коротких крупных
-- заголовков, всё остальное набирается TT Fors.

update public.brand
set data = jsonb_set(data, '{items}', (
  select jsonb_agg(
    case item->>'family'
      when 'Eurostile Extd' then item
        || jsonb_build_object('files', jsonb_build_object(
             '500', 'brand/eurostile-extended-medium.ttf',
             '900', 'brand/eurostile-extended-black.ttf'))
        || jsonb_build_object('weights', 'Medium 500, Black 900')
        || jsonb_build_object('role', 'Заголовки страниц и разделов, крупные акценты. Только короткие строки')
      when 'TT Fors' then item
        || jsonb_build_object('files', jsonb_build_object(
             '400', 'brand/tt-fors-regular.ttf',
             '700', 'brand/tt-fors-bold.ttf'))
        || jsonb_build_object('weights', 'Regular 400, Bold 700')
        || jsonb_build_object('role', 'Весь остальной текст: интерфейс, заголовки карточек, цифры, подписи')
      else item
    end)
  from jsonb_array_elements(data->'items') item))
where kind = 'fonts';

insert into public.brand (id, title, kind, sort, section, data) values
('type-roles', 'Типографика: роли и шкала', 'figure', 42, 'Шрифт и текст', jsonb_build_object(
  'figure', 'type',
  'body', E'Две гарнитуры, у каждой своя работа.\n\n— Eurostile Extended — широкий, акцидентный. Только для коротких крупных строк: заголовок страницы, раздела, обложка. Длинную фразу им не набираем: она разъезжается на три строки и не читается\n— TT Fors — всё остальное: заголовки карточек, текст, кнопки, таблицы, цифры\n— Цифры в таблицах и плитках — табличные: разряды встают друг под другом\n— Жирный — только настоящее начертание Bold, не нарисованное браузером\n\nБез фирменных файлов (до входа, на чужом компьютере) их заменяют Unbounded и Golos Text — близкие по характеру и свободные.'))
on conflict (id) do nothing;
