alter table public.expenses
  drop constraint if exists expenses_receipt_hash_key,
  drop constraint if exists expenses_provider_document_id_key;

create unique index if not exists expenses_wallet_receipt_hash_key
  on public.expenses (wallet_address, receipt_hash);

create unique index if not exists expenses_wallet_provider_document_id_key
  on public.expenses (wallet_address, provider_document_id)
  where provider_document_id is not null;
