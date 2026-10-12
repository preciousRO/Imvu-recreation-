-- Loft: classic avatar chat backend. Everything goes through security definer functions keyed by a session token,
-- so the browser only ever holds the public key and a token. Tables have row level security on with no policies,
-- which blocks all direct access.
create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  name_lc text generated always as (lower(name)) stored,
  pass_hash text not null,
  credits int not null default 5000,
  avatar jsonb not null default '{}'::jsonb,
  bio text not null default '',
  pic text,
  room jsonb not null default '{}'::jsonb,
  last_daily date,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint name_format check (name ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index if not exists app_users_name_lc on app_users(name_lc);
create table if not exists app_sessions (token text primary key, user_id uuid not null references app_users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists app_items (id text primary key, category text not null, price int not null default 0, gender text, data jsonb not null default '{}'::jsonb);
create table if not exists app_inventory (user_id uuid not null references app_users(id) on delete cascade, item_id text not null, acquired_at timestamptz not null default now(), gifted_by uuid, primary key (user_id, item_id));
create table if not exists app_friends (user_id uuid not null references app_users(id) on delete cascade, friend_id uuid not null references app_users(id) on delete cascade, status text not null default 'pending', created_at timestamptz not null default now(), primary key (user_id, friend_id));
create table if not exists app_messages (id bigserial primary key, from_id uuid not null references app_users(id) on delete cascade, to_id uuid not null references app_users(id) on delete cascade, body text not null, created_at timestamptz not null default now(), read boolean not null default false);
create index if not exists app_messages_to on app_messages(to_id, created_at desc);
create table if not exists app_pulse (id bigserial primary key, user_id uuid not null references app_users(id) on delete cascade, body text not null, created_at timestamptz not null default now());
create table if not exists app_rooms (id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references app_users(id) on delete cascade, name text not null default 'My Room', template text not null default 'studio', is_private boolean not null default false, invite text unique not null default encode(gen_random_bytes(4), 'hex'), decor jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());

alter table app_users enable row level security; alter table app_sessions enable row level security; alter table app_items enable row level security;
alter table app_inventory enable row level security; alter table app_friends enable row level security; alter table app_messages enable row level security;
alter table app_pulse enable row level security; alter table app_rooms enable row level security;
revoke all on app_users, app_sessions, app_items, app_inventory, app_friends, app_messages, app_pulse, app_rooms from anon, authenticated;

-- ---------- helpers ----------
create or replace function _app_uid(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select user_id into v from app_sessions where token = p_token and created_at > now() - interval '90 days';
  if v is null then raise exception 'not signed in' using errcode = '28000'; end if;
  update app_users set last_seen = now() where id = v;
  return v;
end $$;

create or replace function _app_user_json(p_id uuid) returns json language sql security definer set search_path = public as $$
  select json_build_object('id', u.id, 'name', u.name, 'credits', u.credits, 'avatar', u.avatar, 'bio', u.bio, 'pic', u.pic, 'created_at', u.created_at,
    'inventory', coalesce((select json_agg(item_id) from app_inventory where user_id = u.id), '[]'::json),
    'unread', (select count(*) from app_messages where to_id = u.id and not read),
    'requests', (select count(*) from app_friends where friend_id = u.id and status = 'pending'),
    'daily_available', (u.last_daily is null or u.last_daily < current_date))
  from app_users u where u.id = p_id $$;

create or replace function _app_new_session(p_id uuid) returns text language plpgsql security definer set search_path = public as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin insert into app_sessions(token, user_id) values (t, p_id); return t; end $$;

-- ---------- accounts ----------
create or replace function app_register(p_name text, p_pass text, p_avatar jsonb default '{}'::jsonb) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; t text;
begin
  if p_name !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'Name must be 3 to 20 letters, numbers or underscores'; end if;
  if char_length(coalesce(p_pass, '')) < 4 then raise exception 'Password must be at least 4 characters'; end if;
  if exists (select 1 from app_users where name_lc = lower(p_name)) then raise exception 'That name is taken'; end if;
  insert into app_users(name, pass_hash, avatar) values (p_name, crypt(p_pass, gen_salt('bf', 8)), coalesce(p_avatar, '{}'::jsonb)) returning id into v_id;
  insert into app_inventory(user_id, item_id) select v_id, id from app_items where price = 0;
  insert into app_rooms(owner_id) values (v_id);
  t := _app_new_session(v_id);
  return json_build_object('token', t, 'user', _app_user_json(v_id));
end $$;

create or replace function app_login(p_name text, p_pass text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; t text;
begin
  select id into v_id from app_users where name_lc = lower(p_name) and pass_hash = crypt(p_pass, pass_hash);
  if v_id is null then raise exception 'Wrong name or password'; end if;
  t := _app_new_session(v_id);
  return json_build_object('token', t, 'user', _app_user_json(v_id));
end $$;

create or replace function app_logout(p_token text) returns void language sql security definer set search_path = public as $$ delete from app_sessions where token = p_token $$;
create or replace function app_me(p_token text) returns json language sql security definer set search_path = public as $$ select _app_user_json(_app_uid(p_token)) $$;
create or replace function app_heartbeat(p_token text) returns void language sql security definer set search_path = public as $$ select _app_uid(p_token) $$;

create or replace function app_save_avatar(p_token text, p_avatar jsonb, p_pic text default null) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  update app_users set avatar = p_avatar, pic = coalesce(p_pic, pic) where id = v_id;
  return _app_user_json(v_id);
end $$;
create or replace function app_save_bio(p_token text, p_bio text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin update app_users set bio = left(coalesce(p_bio, ''), 300) where id = v_id; return _app_user_json(v_id); end $$;

-- ---------- credits and shop ----------
create or replace function app_buy(p_token text, p_item text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_price int;
begin
  select price into v_price from app_items where id = p_item;
  if v_price is null then raise exception 'No such item'; end if;
  if exists (select 1 from app_inventory where user_id = v_id and item_id = p_item) then raise exception 'You already own this'; end if;
  if (select credits from app_users where id = v_id) < v_price then raise exception 'Not enough credits'; end if;
  update app_users set credits = credits - v_price where id = v_id;
  insert into app_inventory(user_id, item_id) values (v_id, p_item);
  return _app_user_json(v_id);
end $$;

create or replace function app_gift(p_token text, p_to text, p_item text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_to uuid; v_price int;
begin
  select id into v_to from app_users where name_lc = lower(p_to); if v_to is null then raise exception 'No such person'; end if;
  select price into v_price from app_items where id = p_item; if v_price is null then raise exception 'No such item'; end if;
  if exists (select 1 from app_inventory where user_id = v_to and item_id = p_item) then raise exception 'They already own this'; end if;
  if (select credits from app_users where id = v_id) < v_price then raise exception 'Not enough credits'; end if;
  update app_users set credits = credits - v_price where id = v_id;
  insert into app_inventory(user_id, item_id, gifted_by) values (v_to, p_item, v_id);
  insert into app_messages(from_id, to_id, body) values (v_id, v_to, '🎁 sent you a gift: ' || p_item);
  return _app_user_json(v_id);
end $$;

create or replace function app_claim_daily(p_token text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  update app_users set credits = credits + 500, last_daily = current_date where id = v_id and (last_daily is null or last_daily < current_date);
  if not found then raise exception 'Come back tomorrow for more credits'; end if;
  return _app_user_json(v_id);
end $$;

-- ---------- people ----------
create or replace function _app_card(p_me uuid, p_other uuid) returns json language sql security definer set search_path = public as $$
  select json_build_object('id', u.id, 'name', u.name, 'pic', u.pic, 'bio', u.bio, 'avatar', u.avatar, 'created_at', u.created_at,
    'online', u.last_seen > now() - interval '3 minutes',
    'friend', exists (select 1 from app_friends f where ((f.user_id = p_me and f.friend_id = u.id) or (f.user_id = u.id and f.friend_id = p_me)) and f.status = 'accepted'),
    'requested', exists (select 1 from app_friends f where f.user_id = p_me and f.friend_id = u.id and f.status = 'pending'),
    'requests_me', exists (select 1 from app_friends f where f.user_id = u.id and f.friend_id = p_me and f.status = 'pending'),
    'room', (select json_build_object('name', r.name, 'template', r.template, 'is_private', r.is_private) from app_rooms r where r.owner_id = u.id))
  from app_users u where u.id = p_other $$;

create or replace function app_profile(p_token text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_other uuid;
begin
  select id into v_other from app_users where name_lc = lower(p_name); if v_other is null then raise exception 'No such person'; end if;
  return _app_card(v_id, v_other);
end $$;

create or replace function app_search(p_token text, p_q text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  return coalesce((select json_agg(_app_card(v_id, u.id)) from (select id from app_users where name_lc like '%' || lower(coalesce(p_q, '')) || '%' and id <> v_id order by last_seen desc limit 30) u), '[]'::json);
end $$;

create or replace function app_friends(p_token text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  return json_build_object(
    'friends', coalesce((select json_agg(_app_card(v_id, o)) from (select case when user_id = v_id then friend_id else user_id end as o from app_friends where (user_id = v_id or friend_id = v_id) and status = 'accepted') x), '[]'::json),
    'requests', coalesce((select json_agg(_app_card(v_id, user_id)) from app_friends where friend_id = v_id and status = 'pending'), '[]'::json),
    'sent', coalesce((select json_agg(_app_card(v_id, friend_id)) from app_friends where user_id = v_id and status = 'pending'), '[]'::json));
end $$;

create or replace function app_friend_request(p_token text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_other uuid;
begin
  select id into v_other from app_users where name_lc = lower(p_name); if v_other is null or v_other = v_id then raise exception 'No such person'; end if;
  if exists (select 1 from app_friends where user_id = v_other and friend_id = v_id and status = 'pending') then
    update app_friends set status = 'accepted' where user_id = v_other and friend_id = v_id;
  else
    insert into app_friends(user_id, friend_id) values (v_id, v_other) on conflict do nothing;
  end if;
  return _app_card(v_id, v_other);
end $$;
create or replace function app_friend_accept(p_token text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_other uuid;
begin
  select id into v_other from app_users where name_lc = lower(p_name);
  update app_friends set status = 'accepted' where user_id = v_other and friend_id = v_id;
  return _app_card(v_id, v_other);
end $$;
create or replace function app_friend_remove(p_token text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_other uuid;
begin
  select id into v_other from app_users where name_lc = lower(p_name);
  delete from app_friends where (user_id = v_id and friend_id = v_other) or (user_id = v_other and friend_id = v_id);
  return _app_card(v_id, v_other);
end $$;

-- ---------- inbox ----------
create or replace function app_send_message(p_token text, p_to text, p_body text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_to uuid;
begin
  select id into v_to from app_users where name_lc = lower(p_to); if v_to is null then raise exception 'No such person'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Empty message'; end if;
  insert into app_messages(from_id, to_id, body) values (v_id, v_to, left(p_body, 1000));
  return json_build_object('ok', true);
end $$;
create or replace function app_inbox(p_token text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  return coalesce((select json_agg(t order by t.last desc) from (
    select u.name, u.pic, max(m.created_at) as last, count(*) filter (where m.to_id = v_id and not m.read) as unread,
      (array_agg(m.body order by m.created_at desc))[1] as preview
    from app_messages m join app_users u on u.id = case when m.from_id = v_id then m.to_id else m.from_id end
    where m.from_id = v_id or m.to_id = v_id group by u.name, u.pic) t), '[]'::json);
end $$;
create or replace function app_thread(p_token text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); v_other uuid;
begin
  select id into v_other from app_users where name_lc = lower(p_name); if v_other is null then raise exception 'No such person'; end if;
  update app_messages set read = true where to_id = v_id and from_id = v_other and not read;
  return coalesce((select json_agg(json_build_object('id', m.id, 'mine', m.from_id = v_id, 'body', m.body, 'at', m.created_at) order by m.created_at)
    from (select * from app_messages where (from_id = v_id and to_id = v_other) or (from_id = v_other and to_id = v_id) order by created_at desc limit 200) m), '[]'::json);
end $$;

-- ---------- pulse ----------
create or replace function app_pulse_post(p_token text, p_body text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Say something first'; end if;
  insert into app_pulse(user_id, body) values (v_id, left(p_body, 500));
  return app_pulse_feed(p_token);
end $$;
create or replace function app_pulse_feed(p_token text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', p.id, 'name', u.name, 'pic', u.pic, 'body', p.body, 'at', p.created_at, 'mine', p.user_id = v_id) order by p.created_at desc)
    from (select * from app_pulse order by created_at desc limit 60) p join app_users u on u.id = p.user_id), '[]'::json);
end $$;

-- ---------- rooms ----------
create or replace function app_room_save(p_token text, p_name text, p_template text, p_private boolean, p_decor jsonb) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token);
begin
  insert into app_rooms(owner_id, name, template, is_private, decor) values (v_id, left(coalesce(p_name, 'My Room'), 40), coalesce(p_template, 'studio'), coalesce(p_private, false), coalesce(p_decor, '[]'::jsonb))
  on conflict (owner_id) do update set name = excluded.name, template = excluded.template, is_private = excluded.is_private, decor = excluded.decor, updated_at = now();
  return app_room_get(p_token, (select name from app_users where id = v_id), null);
end $$;
create or replace function app_room_get(p_token text, p_owner text, p_invite text) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid := _app_uid(p_token); r app_rooms;
begin
  if p_invite is not null then select * into r from app_rooms where invite = p_invite;
  else select r2.* into r from app_rooms r2 join app_users u on u.id = r2.owner_id where u.name_lc = lower(p_owner); end if;
  if r.id is null then raise exception 'No such room'; end if;
  if r.is_private and r.owner_id <> v_id and p_invite is distinct from r.invite then raise exception 'This room is private'; end if;
  return json_build_object('id', r.id, 'owner', (select name from app_users where id = r.owner_id), 'name', r.name, 'template', r.template, 'is_private', r.is_private, 'decor', r.decor, 'invite', case when r.owner_id = v_id then r.invite else null end, 'mine', r.owner_id = v_id);
end $$;

grant execute on all functions in schema public to anon, authenticated;
