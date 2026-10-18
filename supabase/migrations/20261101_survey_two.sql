-- ADERVIS Intelligence · вторая анкета владельцев
--
-- Номера вопросов второй анкеты — «2-1.1»: ответы не смешиваются с первой,
-- где номера были просто «1.1».

alter table public.survey_answers drop constraint if exists survey_answers_id_check;
alter table public.survey_answers add constraint survey_answers_id_check
  check (id ~ '^(\d{1,2}-)?\d{1,2}\.\d{1,2}$');
