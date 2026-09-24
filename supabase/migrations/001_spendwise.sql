create extension if not exists pgcrypto;

create table if not exists public.users (
  wallet_address text primary key check (wallet_address = lower(wallet_address)),
  created_at timestamptz not null default now()
);

create table if not exists public.currency_accounts (
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  currency text not null check (currency in ('IDR', 'USD', 'MYR', 'SGD')),
  budget_amount bigint,
  budget_start date,
  budget_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wallet_address, currency),
  check (budget_amount is null or budget_amount >= 0),
  check (budget_start is null or budget_end is null or budget_start <= budget_end)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  merchant text not null,
  amount bigint not null check (amount > 0),
  expense_date date not null,
  category text not null,
  currency text not null check (currency in ('IDR', 'USD', 'MYR', 'SGD')),
  notes text,
  receipt_path text not null,
  receipt_mime text not null,
  receipt_hash text not null,
  provider_document_id text,
  expense_hash text,
  onchain_id text,
  tx_hash text,
  status text not null default 'APPROVED' check (status in ('APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  unique (receipt_hash),
  unique (provider_document_id)
);

create index if not exists expenses_wallet_currency_date_idx
  on public.expenses (wallet_address, currency, expense_date desc);

create table if not exists public.report_exports (
  id text primary key,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  file_name text not null,
  range_label text not null,
  storage_path text not null,
  file_size bigint not null,
  transaction_count integer not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.currency_accounts enable row level security;
alter table public.expenses enable row level security;
alter table public.report_exports enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false;
