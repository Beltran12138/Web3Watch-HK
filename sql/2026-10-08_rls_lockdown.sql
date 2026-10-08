-- 2026-10-08 收紧 Supabase 权限（已在线上执行）
-- 之前：news 表的策略允许 anon（publishable key）插入、更新；insights / source_tracking / user_preferences 没开 RLS，anon 可任意增删改。
-- 之后：anon 只能读 news（Vercel 的 api/*.js 用 publishable key 只读）；所有写入改用 secret key（GitHub Actions 的 SUPABASE_KEY），secret key 不受 RLS 限制。

drop policy if exists "Service write" on public.news;
drop policy if exists "Service upsert" on public.news;
-- 保留："Public read"（select, anon, using true）

alter table public.insights enable row level security;
alter table public.source_tracking enable row level security;
alter table public.user_preferences enable row level security;
-- 三张表不建任何 anon 策略 = anon 无权访问

-- 同日补充：页面「行业记忆」经 /api/insights（publishable key）只读展示，开放 anon 只读
create policy "Public read" on public.insights for select to anon using (true);
