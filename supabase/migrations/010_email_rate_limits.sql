-- Rate limiting for public email Edge Functions (contact / bug-report)
create table if not exists public.email_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.email_rate_limits is
  'Sliding-window counters for contact/bug-report Edge Functions. Service-role only.';

alter table public.email_rate_limits enable row level security;

-- No policies for anon/authenticated — only service_role (bypasses RLS) may touch this table.
