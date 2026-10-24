-- Связь с Adervis Stock: ключ «только для чтения» из админки Stock лежит в
-- channel_secrets (записать из приложения можно, прочитать — только серверу).
alter table public.channel_secrets drop constraint if exists channel_secrets_name_check;
alter table public.channel_secrets add constraint channel_secrets_name_check
  check (name in ('tg_bot_token', 'tg_webhook_secret', 'vk_token', 'vk_confirmation', 'vk_secret',
                  'ig_page_token', 'ig_verify_token', 'ig_app_secret', 'intel_webhook_secret', 'digest_secret',
                  'crm_email', 'crm_password', 'stock_hub_token'));
