-- ============================================================
-- Migration 00052: Multi-tenant foundation (organizations + members)
-- Status: DRAFT (待评审 — 不要直接 supabase db push 上生产)
-- 依赖: 00001..00051 已应用
-- 后续: 00053 给所有业务表加 organization_id + 重写 RLS
-- ============================================================

-- ============================================================
-- 1. organizations 表（一个租户工作区 = 一行）
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,                -- URL slug, e.g. "ivyjstudio"
    name TEXT NOT NULL,                       -- 显示名
    custom_domain TEXT UNIQUE,                -- e.g. "rental.ivyjstudio.com" (Pro 套餐解锁)

    -- 计费
    plan TEXT NOT NULL DEFAULT 'trial'
        CHECK (plan IN ('trial', 'starter', 'pro', 'studio', 'enterprise')),
    trial_ends_at TIMESTAMPTZ,
    billing_provider TEXT
        CHECK (billing_provider IN ('lemonsqueezy', 'stripe', 'manual') OR billing_provider IS NULL),
    billing_customer_id TEXT,                 -- Lemon Squeezy / Stripe customer id
    subscription_id TEXT,                     -- 当前活跃订阅
    subscription_status TEXT
        CHECK (subscription_status IN ('active', 'past_due', 'cancelled', 'paused', 'trialing') OR subscription_status IS NULL),
    seats_purchased INT NOT NULL DEFAULT 1,

    -- 配置（JSONB 灵活）— 用于 per-org 主题色 / 邮件签名 / 时区等
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,                   -- 软删除

    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND length(slug) BETWEEN 3 AND 32),
    CONSTRAINT slug_not_reserved CHECK (slug NOT IN (
        'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'docs',
        'help', 'login', 'logout', 'pricing', 'privacy', 'public',
        'settings', 'signup', 'static', 'support', 'terms', 'www'
    ))
);

CREATE INDEX idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_custom_domain ON organizations(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_organizations_billing_customer ON organizations(billing_customer_id) WHERE billing_customer_id IS NOT NULL;

-- ============================================================
-- 2. organization_members 表（user × org × role）
-- ============================================================
-- 一个 user 可以属于多个 org（典型：A 是自己工作室的 owner，同时被邀请到 B 工作室当 staff）
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(organization_id, role);

-- 每个 org 至少要有 1 个 owner（约束：删除最后一个 owner 时报错）
CREATE OR REPLACE FUNCTION enforce_org_has_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role != 'owner')) THEN
        IF NOT EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = OLD.organization_id
              AND role = 'owner'
              AND user_id != OLD.user_id
        ) THEN
            RAISE EXCEPTION 'Cannot remove last owner of organization %', OLD.organization_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_enforce_org_has_owner
    BEFORE UPDATE OR DELETE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION enforce_org_has_owner();

-- ============================================================
-- 3. organization_invitations 表（邀请未注册用户）
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, email)
);

CREATE INDEX idx_org_invites_token ON organization_invitations(token) WHERE accepted_at IS NULL;

-- ============================================================
-- 4. JWT custom claim helper — 让 RLS 能 O(1) 拿到 org_id
-- ============================================================
-- 用法：在 access_token hook 里把 user 的当前 org_id 写进 JWT custom claim
-- 前端切换 org 时调用 supabase.auth.refreshSession() 刷新 token
-- ============================================================

CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID
LANGUAGE SQL STABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(
        COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'current_org_id'),
            (auth.jwt() ->> 'org_id')        -- 备用键名，兼容老 token
        ),
        ''
    )::UUID;
$$;

CREATE OR REPLACE FUNCTION current_org_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM organization_members
    WHERE organization_id = current_org_id()
      AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_org_owner() RETURNS BOOLEAN
LANGUAGE SQL STABLE
SET search_path = public, pg_temp
AS $$
    SELECT current_org_role() = 'owner';
$$;

CREATE OR REPLACE FUNCTION is_org_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE
SET search_path = public, pg_temp
AS $$
    SELECT current_org_role() IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION is_org_member(org_id UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION is_org_owner_of(org_id UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role = 'owner'
    );
$$;

CREATE OR REPLACE FUNCTION is_org_admin_of(org_id UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
    );
$$;

-- ============================================================
-- 5. 注册新用户时不再自动创建 admin（旧行为）
--    新行为：用户注册 → handle_new_user 只创建 profile
--    创建 organization 是单独动作（onboarding 页面引导）
-- ============================================================
-- profiles 表已有 handle_new_user trigger（migration 00001），保持不变
-- migration 00007 后注册的用户 role 默认是 customer，这个语义不再适用
-- 后续 migration 00053 会把 profiles.role 列废弃（但不删，保兼容）

-- ============================================================
-- 6. 新建 organization 的 RPC（前端调用）
-- ============================================================
CREATE OR REPLACE FUNCTION create_organization(
    p_slug TEXT,
    p_name TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO organizations (slug, name, plan, trial_ends_at)
    VALUES (
        lower(p_slug),
        p_name,
        'trial',
        NOW() + INTERVAL '14 days'
    )
    RETURNING id INTO v_org_id;

    INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
    VALUES (v_org_id, v_user_id, 'owner', NOW());

    RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7. RLS — organizations / organization_members
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- organizations: 成员能看自己 org，owner/admin 能改
CREATE POLICY "Members can view their organizations" ON organizations
    FOR SELECT USING (is_org_member(id));

CREATE POLICY "Owners can update organization" ON organizations
    FOR UPDATE USING (is_org_owner_of(id));

-- 注：INSERT 走 create_organization() RPC，不走表 INSERT 策略
-- DELETE 走软删除（更新 deleted_at），不允许直接 DELETE

-- organization_members: 成员能看自己 org 的所有成员；admin/owner 能改
CREATE POLICY "Members can view org members" ON organization_members
    FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Owners and admins can manage members" ON organization_members
    FOR ALL USING (is_org_admin_of(organization_id));

-- organization_invitations: admin/owner 能管理；被邀请人凭 token 能查（无需登录）
CREATE POLICY "Admins can manage invitations" ON organization_invitations
    FOR ALL USING (is_org_admin_of(organization_id));

-- ============================================================
-- 8. updated_at trigger
-- ============================================================
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. PostgREST 重载
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 验证 SQL（手动跑）：
-- ============================================================
-- SELECT * FROM organizations;
-- SELECT * FROM organization_members;
-- SELECT current_org_id();           -- 未登录返回 NULL
-- SELECT is_org_admin();              -- 未在 org 中返回 FALSE
-- ============================================================
