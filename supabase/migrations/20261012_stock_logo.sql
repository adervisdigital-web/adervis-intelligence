-- Брендбук: логотип ADERVIS Stock и исправление его цвета.
--
-- Раньше цветом Stock был записан зелёный #87e64b из переменной --envato
-- на портале. Это цвет Envato: им помечены файлы площадки. Логотип Stock
-- золотой — капсула с градиентом #f6bd3a → #c8901f.

insert into public.brand (id, title, kind, sort, section, data) values
('stock-logo', 'Логотип ADERVIS Stock', 'figure', 5, 'ADERVIS Stock', jsonb_build_object(
  'figure', 'stocklogo',
  'body', E'Надпись в две строки: ADERVIS и STOCK, где «O» — золотая капсула. Сама капсула — знак продукта: фавикон, аватар, иконка приложения.\n\n— На тёмном фоне — файл со светлыми буквами, на светлом — с тёмными\n— Капсула всегда золотая, градиент #f6bd3a → #c8901f, буквы не перекрашиваем\n— Шрифт надписи — Eurostile Extended, как у ADERVIS: логотипы одной семьи\n— Исходники в портале названы по цвету букв, здесь — по фону. Не перепутать'))
on conflict (id) do nothing;

update public.brand set data = jsonb_set(data, '{body}', to_jsonb(E'Золото капсулы из логотипа: градиент #f6bd3a → #c8901f.\n\n— Зелёный #87e64b на портале — цвет Envato, им помечены файлы площадки. Фирменным цветом Stock он не является\n— В графиках и метках рядом со студией Stock — бронза #c8901f: тёмный конец своего же градиента. Иначе два золота не различить\n— На светлом фоне для текста — тёмная бронза #8a5f10, иначе не хватает контраста'::text))
where id = 'p-stock';

update public.brand set data = jsonb_set(data, '{body}', to_jsonb(replace(data->>'body',
  '— ADERVIS Stock — зелёный #87e64b, тёмный вариант #6bb23e',
  '— ADERVIS Stock — золото капсулы #f6bd3a → #c8901f; зелёный на портале — это цвет Envato, не наш')))
where id = 'dir-colors';
