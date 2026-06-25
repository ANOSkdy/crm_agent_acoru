create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  corporate_number text,
  industry text,
  website_url text,
  postal_code text,
  address text,
  phone text,
  status text not null default 'active',
  source text,
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  department text,
  position text,
  email text,
  phone text,
  is_decision_maker boolean not null default false,
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists deal_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null,
  default_probability integer not null default 0,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  amount numeric(12, 0) not null default 0,
  stage_id uuid references deal_stages(id),
  probability integer not null default 0,
  expected_close_date date,
  owner_user_id uuid references users(id),
  status text not null default 'open',
  memo text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  contact_id uuid references contacts(id),
  deal_id uuid references deals(id),
  type text not null,
  activity_date timestamptz not null,
  summary text not null,
  body text,
  next_action text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references users(id),
  created_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  filename text not null,
  file_url text not null,
  mime_type text,
  file_type text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists ai_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  deal_id uuid references deals(id),
  summary_type text not null,
  source_hash text,
  content text not null,
  generated_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
