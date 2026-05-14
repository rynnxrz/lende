-- ============================================================
-- Migration 00054: JWT custom claims hook + org switcher RPC
-- Status: DRAFT (待评审 — 不要直接 supabase db push 上生产)
-- 依赖: 00052_multi_tenant_orgs.sql, 00053_add_org_to_business_tables.sql
-- ============================================================
-- 目的:
--   1. 在 Supabase 签发 JWT 时自动注入 `app_metadata.current_org_id`，让
--      00052 的 current_org_id() helper 能 O(1) 拿到 org，无需查表
--   2. 用户切换 org 走 set_active_organization() RPC + 前端
--      supabase.auth.refreshSession()，新 token 立刻生效
--   3. 兼容老调用：旧的 is_admin() 重定义为 is_org_admin() 的 shim
--      （rls-audit-2026-04-30.md §5.1 / §6.1 关键发现）
-- ============================================================
-- ⚠️ Dashboard 配置（迁移之外的人工步骤）:
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token
--     Type      = Postgres
--     Schema    = public
--     Function  = custom_access_token_hook
--   未注册时 hook 不会生效，JWT 不会带 current_org_id，
--   00052 的 current_org_id() 会返回 NULL → 所有 RLS 拒绝 → 全站 403。
--   实施顺序: apply 00054 → Dashboard 注册 hook → 测试登录 → 上前端。
-- ============================================================

BEGIN;

-- ============================================================
-- 1. profiles 加 last_active_org_id 列（用户最后选定的 org，断线重连后默认进这个）
-- ============================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS last_active_org_id UUID
        REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_org
    ON profiles(last_active_org_id) WHERE last_active_org_id IS NOT NULL;

-- ============================================================
-- 2. custom_access_token_hook
-- ============================================================
-- Supabase 在签发 access token 时调用本函数，传入:
--   event = {
--     user_id: uuid,
--     claims: jsonb,                  -- 标准 claims（sub / email / role 等）
--     authentication_method: text
--   }
-- 返回:
--   { claims: jsonb }                 -- 被修改后的 claims
-- 要求:
--   - SECURITY DEFINER（函数以 superuser 跑，绕过 RLS）
--   - 必须 fail-safe：异常时返回原 claims，不要让登录整体崩
--   - 必须 STABLE / 短路径，避免拖慢每次 token 签发
-- 参考:
--   https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
-- ============================================================

CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id      UUID;
    v_claims       jsonb;
    v_app_metadata jsonb;
    v_org_id       UUID;
    v_org_role     TEXT;
BEGIN
    v_user_id := (event ->> 'user_id')::UUID;
    v_claims  := event -> 'claims';

    -- 防御：缺字段直接还原 event
    IF v_user_id IS NULL OR v_claims IS NULL THEN
        RETURN event;
    END IF;

    -- ---------------------------------------------------------
    -- 解析当前 org 优先级:
    --   1. profiles.last_active_org_id（用户上次切到哪）
    --      AND 用户当前仍是该 org 的 member
    --   2. organization_members 中按 created_at 升序选第一个
    --   3. 如果都没有 → 不写 org_id（用户尚未加入任何 org，前端引导 onboarding）
    -- ---------------------------------------------------------
    SELECT om.organization_id, om.role
    INTO v_org_id, v_org_role
    FROM profiles p
    JOIN organization_members om
      ON om.user_id = p.id
     AND om.organization_id = p.last_active_org_id
    WHERE p.id = v_user_id
    LIMIT 1;

    -- fallback: 没有 last_active_org_id 或它已不再是 member → 拿任意 org（按加入顺序）
    IF v_org_id IS NULL THEN
        SELECT om.organization_id, om.role
        INTO v_org_id, v_org_role
        FROM organization_members om
        WHERE om.user_id = v_user_id
          AND om.accepted_at IS NOT NULL
        ORDER BY om.created_at ASC
        LIMIT 1;
    END IF;

    -- ---------------------------------------------------------
    -- 写入 app_metadata（被 RLS helper 读）
    --   app_metadata 是 user-immutable claims，前端只读。
    --   现有 v_claims.app_metadata 可能已有别的字段（provider 等），
    --   用 jsonb_build_object || 合并保留它们。
    -- ---------------------------------------------------------
    v_app_metadata := COALESCE(v_claims -> 'app_metadata', '{}'::jsonb);

    IF v_org_id IS NOT NULL THEN
        v_app_metadata := v_app_metadata
            || jsonb_build_object(
                'current_org_id', v_org_id::text,
                'current_org_role', v_org_role
            );
    ELSE
        -- 显式标记"无 org"，前端据此跳 onboarding
        v_app_metadata := v_app_metadata
            || jsonb_build_object('current_org_id', NULL);
    END IF;

    v_claims := v_claims || jsonb_build_object('app_metadata', v_app_metadata);

    RETURN jsonb_build_object('claims', v_claims);

EXCEPTION WHEN OTHERS THEN
    -- fail-safe：日志 + 还原 claims，不阻塞登录
    INSERT INTO system_errors (error_type, error_payload, fingerprint)
    VALUES (
        'jwt_hook_failure',
        jsonb_build_object(
            'user_id', v_user_id,
            'sqlstate', SQLSTATE,
            'sqlerrm', SQLERRM
        ),
        encode(digest('jwt_hook_failure:' || COALESCE(v_user_id::text, 'unknown'), 'sha256'), 'hex')
    )
    ON CONFLICT DO NOTHING;
    RETURN event;
END;
$$;

-- 仅 supabase_auth_admin 角色（GoTrue 用）能执行。其他角色看不到。
REVOKE EXECUTE ON FUNCTION custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- 让 supabase_auth_admin 能读 profiles / organization_members 这两张表
-- （BYPASS RLS 不够，因为 SECURITY DEFINER 已经绕了；这里给的是基础 SELECT）
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON profiles, organization_members TO supabase_auth_admin;

-- ============================================================
-- 3. set_active_organization RPC（用户切换 org）
-- ============================================================
-- 流程:
--   client → supabase.rpc('set_active_organization', { p_org_id })
--          → 校验 user 是该 org 的 member
--          → 更新 profiles.last_active_org_id
--   client → supabase.auth.refreshSession()
--          → 新 token 触发 hook 重读 last_active_org_id
--          → 新 token 的 app_metadata.current_org_id = p_org_id
-- ============================================================

CREATE OR REPLACE FUNCTION set_active_organization(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 用户必须是该 org 的 accepted member
    IF NOT EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = v_user_id
          AND organization_id = p_org_id
          AND accepted_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User % is not a member of organization %', v_user_id, p_org_id
            USING ERRCODE = '42501';
    END IF;

    UPDATE profiles
       SET last_active_org_id = p_org_id,
           updated_at = NOW()
     WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_active_organization(UUID) TO authenticated;

-- ============================================================
-- 4. 扩展 handle_new_user：保持 00001 行为 + 兼容 00052/00053
-- ============================================================
-- 注：00001 trigger 仍然 fire，下面 CREATE OR REPLACE 是直接覆盖。
-- 新行为：profile 仍创建（保持兼容），但 role 默认改成 NULL/customer，
--        last_active_org_id 留空（用户走 onboarding 创建/加入 org 后才填）。
-- 不在 trigger 里自动创建 org —— org 创建走 create_organization() RPC（00052），
-- 由 onboarding UI 显式触发。
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'full_name'
    )
    ON CONFLICT (id) DO NOTHING;
    -- last_active_org_id 留空：onboarding flow 调 create_organization() / 接受邀请后再填
    RETURN NEW;
END;
$$;

-- 00001 trigger on_auth_user_created 仍生效，无需重建

-- ============================================================
-- 5. is_admin() 兼容 shim（rls-audit §5.1 / §6.1 critical）
-- ============================================================
-- 23 条老 policies 调用 is_admin()，但生产库的源不在 migration 里。
-- 这里把它显式定义为 is_org_admin() 的别名（00052 已定义后者）。
-- 老 policies "EXISTS profiles role='admin'" 在 00053 已 DROP；
-- 但 00053 没动 profiles / system_errors / emergency_backups / storage 的老 policies。
-- 这些老 policies 仍调 is_admin() —— 让它们继续工作而不 crash，
-- 直到后续 brief 把这些表逐个改造成 org-aware。
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public, pg_temp
AS $$
    -- 行为兼容:
    --   旧 is_admin() = profiles.role = 'admin'（全局判断）
    --   新 is_admin() = is_org_admin()（按当前 JWT 的 org 判断）
    -- 任何调用 is_admin() 的老 policy 现在变成"按 current_org_id 的 admin/owner 判断"。
    -- 注意:
    --   - 仍依赖 00052 的 is_org_admin() —— 它读 current_org_id()
    --   - JWT 没 current_org_id 时 is_org_admin() 返回 FALSE → 老 policy 全否决
    --     这是预期行为（safer fail）
    SELECT is_org_admin();
$$;

-- ============================================================
-- 6. 重载 PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 验证 SQL（手动跑）：
-- ============================================================
-- -- 1. hook 注册前 simulate
-- SELECT custom_access_token_hook(
--     jsonb_build_object(
--         'user_id', '<some-real-user-uuid>',
--         'claims', jsonb_build_object(
--             'sub', '<same-uuid>',
--             'email', 'demo@example.com',
--             'app_metadata', jsonb_build_object('provider', 'email')
--         ),
--         'authentication_method', 'password'
--     )
-- );
-- -- 期望 returned.claims.app_metadata.current_org_id 已被设置（或显式 null）。
--
-- -- 2. set_active_organization 校验
-- BEGIN;
-- SELECT set_config('request.jwt.claims', '{"sub":"<user-uuid>"}', true);
-- SELECT set_active_organization('<org-id-user-not-member-of>');  -- 期望 raise EXCEPTION 42501
-- ROLLBACK;
--
-- -- 3. last_active_org_id 列存在
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name = 'last_active_org_id';
--
-- -- 4. is_admin() 现在等价 is_org_admin()
-- SELECT is_admin() = is_org_admin() AS shim_ok;
-- ============================================================
