-- Optional server-only event store. Run in a new Supabase project SQL editor.
create table if not exists public.aegis_events (id bigint generated always as identity primary key,event jsonb not null,created_at timestamptz not null default now());
create table if not exists public.aegis_counters (id int primary key check (id=1),total bigint not null default 0,by_source jsonb not null default '{}');
insert into public.aegis_counters(id) values(1) on conflict do nothing;
alter table public.aegis_events enable row level security;
alter table public.aegis_counters enable row level security;
revoke all on public.aegis_events,public.aegis_counters from anon,authenticated;
grant all on public.aegis_events,public.aegis_counters to service_role;
grant usage,select on sequence public.aegis_events_id_seq to service_role;
create or replace function public.aegis_append(batch jsonb,cap integer) returns integer language plpgsql security definer set search_path=public as $$
declare n integer; kv record;
begin
 if jsonb_typeof(batch)<>'array' or cap<100 or cap>50000 then raise exception 'Invalid batch or capacity'; end if;
 perform pg_advisory_xact_lock(710061);
 insert into public.aegis_events(event) select value from jsonb_array_elements(batch);
 get diagnostics n=row_count;
 update public.aegis_counters set total=total+n where id=1;
 for kv in select value->>'source' as source,count(*) as count from jsonb_array_elements(batch) group by 1 loop
  update public.aegis_counters set by_source=jsonb_set(by_source,array[kv.source],to_jsonb(coalesce((by_source->>kv.source)::bigint,0)+kv.count)) where id=1;
 end loop;
 delete from public.aegis_events where id < (select id from public.aegis_events order by id desc offset cap-1 limit 1);
 return n;
end $$;
revoke all on function public.aegis_append(jsonb,integer) from public,anon,authenticated;
grant execute on function public.aegis_append(jsonb,integer) to service_role;
