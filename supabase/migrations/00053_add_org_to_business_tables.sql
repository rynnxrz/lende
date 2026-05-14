-- ============================================================
-- Migration 00053: 给所有业务表加 organization_id + 重写 RLS
-- Status: DRAFT (待评审 — 不要直接 supabase db push 上生产)
-- 依赖: 00052_multi_tenant_orgs.sql
-- ============================================================
-- 注意事项:
--   1. 这是大迁移，必须在 staging Supabase 项目先 dry run
--   2. 用 Ivy 现有数据做迁移测试
--   3. 所有 ALTER TABLE 步骤包成事务，失败回滚
--   4. 假设当前所有数据归属一个默认 org（slug=ivyjstudio）
-- ============================================================

BEGIN;

-- ============================================================
-- Step 1: 创建默认 org 承载现存数据
-- ============================================================
INSERT INTO organizations (slug, name, plan, settings)
VALUES (
    'ivyjstudio',
    'IVYJSTUDIO',
    'studio',          -- 老用户给最高 plan，不限制
    jsonb_build_object(
        'is_legacy', true,
        'migrated_from_v1', true,
        'migrated_at', NOW()
    )
)
ON CONFLICT (slug) DO NOTHING;

-- 把所有现存 admin 用户加为 owner（保留管理权）
INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
SELECT
    (SELECT id FROM organizations WHERE slug = 'ivyjstudio'),
    p.id,
    'owner',
    NOW()
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 现存 customer 角色不自动加入 ivyjstudio org（他们是 Ivy 的客户，不是工作区成员）
-- 客户身份在 reservations.customer_id 里通过 profiles 关联，不需要进 organization_members

-- ============================================================
-- Step 2: 业务表加 organization_id 列（先允许 NULL → backfill → SET NOT NULL）
-- ============================================================

-- items
ALTER TABLE items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE items SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE items ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_org ON items(organization_id);

-- reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE reservations SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE reservations ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_org ON reservations(organization_id);

-- billing_profiles
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE billing_profiles SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE billing_profiles ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_profiles_org ON billing_profiles(organization_id);

-- categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE categories SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_org ON categories(organization_id);

-- collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE collections SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE collections ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(organization_id);

-- invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE invoices SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

-- invoice_items（通过 invoice 间接归属，但加列以便 RLS 直接查）
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE invoice_items ii SET organization_id = i.organization_id FROM invoices i WHERE ii.invoice_id = i.id AND ii.organization_id IS NULL;
ALTER TABLE invoice_items ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_org ON invoice_items(organization_id);

-- staging_imports / staging_items / staging_import_corrections / staging_import_events
ALTER TABLE staging_imports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE staging_imports SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE staging_imports ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staging_imports_org ON staging_imports(organization_id);

ALTER TABLE staging_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE staging_items SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE staging_items ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staging_items_org ON staging_items(organization_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staging_import_corrections') THEN
        EXECUTE 'ALTER TABLE staging_import_corrections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE';
        EXECUTE 'UPDATE staging_import_corrections SET organization_id = (SELECT id FROM organizations WHERE slug = ''ivyjstudio'') WHERE organization_id IS NULL';
        EXECUTE 'ALTER TABLE staging_import_corrections ALTER COLUMN organization_id SET NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_staging_import_corrections_org ON staging_import_corrections(organization_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staging_import_events') THEN
        EXECUTE 'ALTER TABLE staging_import_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE';
        EXECUTE 'UPDATE staging_import_events SET organization_id = (SELECT id FROM organizations WHERE slug = ''ivyjstudio'') WHERE organization_id IS NULL';
        EXECUTE 'ALTER TABLE staging_import_events ALTER COLUMN organization_id SET NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_staging_import_events_org ON staging_import_events(organization_id)';
    END IF;
END $$;

-- ai_decisions / ai_decision_events / ai_feedback
ALTER TABLE ai_decisions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ai_decisions SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE ai_decisions ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_decisions_org ON ai_decisions(organization_id);

ALTER TABLE ai_decision_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ai_decision_events SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE ai_decision_events ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_decision_events_org ON ai_decision_events(organization_id);

ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ai_feedback SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE ai_feedback ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_feedback_org ON ai_feedback(organization_id);

-- customer_service_*
ALTER TABLE customer_service_sessions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE customer_service_sessions SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE customer_service_sessions ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_sessions_org ON customer_service_sessions(organization_id);

ALTER TABLE customer_service_messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE customer_service_messages SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE customer_service_messages ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_messages_org ON customer_service_messages(organization_id);

ALTER TABLE customer_service_email_challenges ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE customer_service_email_challenges SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE customer_service_email_challenges ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_email_challenges_org ON customer_service_email_challenges(organization_id);

ALTER TABLE customer_service_handoffs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE customer_service_handoffs SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE customer_service_handoffs ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_handoffs_org ON customer_service_handoffs(organization_id);

ALTER TABLE reservation_group_assessments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE reservation_group_assessments SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE reservation_group_assessments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rga_org ON reservation_group_assessments(organization_id);

-- app_settings: 改成 per-org（添加 org_id, 复合主键）
-- 注：app_settings 之前是单行配置（key/value 或 单行多列）。先看实际结构再决定。
-- 假设是单行配置表 — 改造方案：加 org_id，每 org 一行
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE app_settings SET organization_id = (SELECT id FROM organizations WHERE slug = 'ivyjstudio') WHERE organization_id IS NULL;
ALTER TABLE app_settings ALTER COLUMN organization_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_org_unique ON app_settings(organization_id);

-- ============================================================
-- Step 3: 重写 RLS 策略
-- ============================================================
-- 套路：
--   SELECT  → organization_id = current_org_id() AND is_org_member(...)
--   INSERT  → 强制 organization_id = current_org_id()
--   UPDATE  → 行属于当前 org AND is_org_admin()
--   DELETE  → 同 UPDATE
-- ============================================================

-- 删除老 RLS（按业务表）
DO $$
DECLARE
    t TEXT;
    p TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'items', 'reservations', 'billing_profiles', 'categories', 'collections',
        'invoices', 'invoice_items', 'staging_imports', 'staging_items',
        'ai_decisions', 'ai_decision_events', 'ai_feedback',
        'customer_service_sessions', 'customer_service_messages',
        'customer_service_email_challenges', 'customer_service_handoffs',
        'reservation_group_assessments', 'app_settings'
    ] LOOP
        FOR p IN
            SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
        END LOOP;
    END LOOP;
END $$;

-- 通用 helper：生成一组 RLS 策略
-- 因为 PG 不支持把 policy 抽成宏，下面手写每张表
-- 优先用 ARRAY + 循环减少重复，但 CREATE POLICY 不支持动态 SQL 时用静态写法

-- items (公开 catalog 需要例外：未登录用户也能看 status='active' 的 items，但只能看到指定 org 的)
CREATE POLICY "Public can view active items by org slug" ON items
    FOR SELECT USING (
        status = 'active'
        AND organization_id IS NOT NULL
    );
-- ↑ 注：公开访问是通过 URL slug 找到 org_id（路由层），然后查 items。这个 policy 本身只保证 status=active 时可读，slug 过滤在应用层做。
-- 如果想做更严格的隔离，把上面 policy 删掉，改用 service role + 应用层 query 注入 org_id。

CREATE POLICY "Org members can view all items" ON items
    FOR SELECT USING (organization_id = current_org_id() AND is_org_member(organization_id));

CREATE POLICY "Org admins can mutate items" ON items
    FOR ALL USING (organization_id = current_org_id() AND is_org_admin())
    WITH CHECK (organization_id = current_org_id() AND is_org_admin());

-- reservations
CREATE POLICY "Org members view org reservations" ON reservations
    FOR SELECT USING (organization_id = current_org_id() AND is_org_member(organization_id));

CREATE POLICY "Customer view own reservations" ON reservations
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Org admins manage reservations" ON reservations
    FOR ALL USING (organization_id = current_org_id() AND is_org_admin())
    WITH CHECK (organization_id = current_org_id() AND is_org_admin());

-- billing_profiles / categories / collections / invoices / invoice_items
-- 标准 4-policy 模式：select for members, ALL for admins
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'billing_profiles', 'categories', 'collections',
        'invoices', 'invoice_items',
        'staging_imports', 'staging_items',
        'ai_decisions', 'ai_decision_events', 'ai_feedback',
        'customer_service_sessions', 'customer_service_messages',
        'customer_service_email_challenges', 'customer_service_handoffs',
        'reservation_group_assessments', 'app_settings'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "Org members read %1$I" ON public.%1$I FOR SELECT USING (organization_id = current_org_id() AND is_org_member(organization_id))',
            t
        );
        EXECUTE format(
            'CREATE POLICY "Org admins manage %1$I" ON public.%1$I FOR ALL USING (organization_id = current_org_id() AND is_org_admin()) WITH CHECK (organization_id = current_org_id() AND is_org_admin())',
            t
        );
    END LOOP;
END $$;

-- ============================================================
-- Step 4: 重写关键 SQL function 让它们 org-aware
-- ============================================================
-- check_item_availability 必须按 org 过滤，否则租户 A 的 reservation 可能阻塞租户 B 的 booking
-- 注意：用 CREATE OR REPLACE（不 DROP），因为 view available_items_today (00001:127) 依赖此函数。
-- 签名相同时（4-arg: UUID, DATE, DATE, UUID DEFAULT NULL）会原地替换 body，保留依赖关系。
-- 00057 之后会重写 view 为 org-scoped。
-- ============================================================
CREATE OR REPLACE FUNCTION check_item_availability(
    p_item_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_exclude_reservation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- 拿到 item 所属 org（避免传参，简化 API）
    SELECT organization_id INTO v_org_id FROM items WHERE id = p_item_id;
    IF v_org_id IS NULL THEN
        RETURN FALSE;  -- item 不存在
    END IF;

    RETURN NOT EXISTS (
        SELECT 1 FROM reservations
        WHERE item_id = p_item_id
          AND organization_id = v_org_id   -- 关键：防止跨 org 干扰
          AND status::text IN ('Upcoming', 'Ongoing')
          AND start_date <= p_end_date
          AND end_date >= p_start_date
          AND (p_exclude_reservation_id IS NULL OR id != p_exclude_reservation_id)
    );
END;
$$;

-- 类似要重写的函数（后续 migration 处理，这里列名）：
--   get_available_items / get_available_items_v2
--   get_unavailable_date_ranges
--   commit_staging_batch
--   restore_reservation
-- 全部需要加 organization_id 过滤

-- ============================================================
-- Step 5: profiles.role 字段语义保留但意义变化
-- ============================================================
-- 旧语义：admin = 全平台管理员；customer = 任何客户
-- 新语义：profiles 是用户全局身份；admin 权限走 organization_members.role
-- 不删除该列，避免破坏旧代码；后续逐步替换 requireAdmin() 为 requireOrgAdmin()
-- ============================================================

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 验证 SQL（手动跑）：
-- ============================================================
-- -- 1. 数据归属
-- SELECT organization_id, COUNT(*) FROM items GROUP BY organization_id;
-- -- 应该看到 1 行：(ivyjstudio uuid, N)
--
-- -- 2. RLS 隔离测试 — 模拟另一个 org 的 user
-- BEGIN;
-- SELECT set_config('request.jwt.claims', '{"sub":"<user-uuid-of-other-org>","app_metadata":{"current_org_id":"<org2-uuid>"}}', true);
-- SELECT COUNT(*) FROM items;  -- 应该返回 0（看不到 ivyjstudio 的 items）
-- ROLLBACK;
--
-- -- 3. availability 测试
-- SELECT check_item_availability('<some-item-id>', CURRENT_DATE, CURRENT_DATE + 7);
-- ============================================================
