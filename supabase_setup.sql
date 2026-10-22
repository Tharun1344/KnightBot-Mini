-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)
-- Creates the tables KnightBot-Mini needs for persistent storage.

create table if not exists kb_groups (
  group_id text primary key,
  settings jsonb not null default '{}'::jsonb
);

create table if not exists kb_users (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists kb_warnings (
  key text primary key,          -- format: "{groupId}_{userId}"
  data jsonb not null default '{}'::jsonb
);

create table if not exists kb_moderators (
  user_id text primary key
);

create table if not exists kb_sudo_users (
  jid text primary key
);

-- Enable RLS on all tables. Server-side secret/service_role keys bypass RLS;
-- do not expose such a key to browsers or commit it to source control.
-- The bot uses a server-side key, so no public/anon policies are needed.


alter table kb_groups enable row level security;
alter table kb_users enable row level security;
alter table kb_warnings enable row level security;
alter table kb_moderators enable row level security;
alter table kb_sudo_users enable row level security;
