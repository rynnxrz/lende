const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the actual action without loading unrelated AI/PDF server dependencies.
const source = ts.createSourceFile('items.ts', fs.readFileSync(path.join(__dirname, '../../src/actions/items.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const definitions = source.statements.filter(statement =>
    (ts.isFunctionDeclaration(statement) && statement.name?.text === 'createCollection') ||
    (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'slugify'))
).map(statement => statement.getText(source)).join('\n')
const compiled = ts.transpileModule(definitions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

function harness({ user = { app_metadata: { current_org_id: 'org-a' } }, databaseError = null } = {}) {
    const inserts = []
    const refreshed = []
    let serviceCalls = 0
    const client = {
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from: table => ({ insert: payload => {
            assert.equal(table, 'collections')
            inserts.push(payload)
            return { select: () => ({ single: async () => {
                // Mirror the NOT NULL constraint introduced by migration 00053.
                const error = databaseError || (!payload.organization_id ? { message: 'organization_id cannot be null' } : null)
                return { data: error ? null : { id: 'collection-new', ...payload }, error }
            } }) }
        } }),
    }
    const context = {
        exports: {},
        requireAdmin: async () => {
            if (!user) throw new Error('Unauthorized')
            return user
        },
        createClient: async () => client,
        createServiceClient: () => { serviceCalls++; return client },
        revalidateAdminPath: value => refreshed.push(value),
    }
    vm.runInNewContext(compiled, context)
    return { create: context.exports.createCollection, inserts, refreshed, client, serviceCalls: () => serviceCalls }
}

const settingsSource = ts.createSourceFile('actions.ts', fs.readFileSync(path.join(__dirname, '../../src/app/admin/settings/actions.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const settingsDefinitions = settingsSource.statements.filter(statement =>
    (ts.isFunctionDeclaration(statement) && statement.name?.text === 'createCollection') ||
    (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(settingsSource) === 'slugify'))
).map(statement => statement.getText(settingsSource)).join('\n')
const settingsCode = ts.transpileModule(settingsDefinitions, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

const managerSource = ts.createSourceFile('CatalogSetupManager.tsx', fs.readFileSync(path.join(__dirname, '../../src/app/admin/settings/components/CatalogSetupManager.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let createHandler
function findCreateHandler(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(managerSource) === 'handleCreate') createHandler = node.initializer.getText(managerSource)
    ts.forEachChild(node, findCreateHandler)
}
findCreateHandler(managerSource)
const createHandlerCode = ts.transpileModule(`const run = ${createHandler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText

for (const success of [true, false]) {
    test(`settings dialog ${success ? 'closes and refreshes on success' : 'stays open with a visible error on failure'}`, async () => {
        const state = { open: 'collection', name: 'Summer', error: null, refreshed: false, successToast: false }
        const run = vm.runInNewContext(`${createHandlerCode}\nrun`, {
            newItemName: state.name, isCreating: false,
            createCollection: async () => ({ success, error: success ? null : 'Please select a workspace.' }),
            setIsCreating: value => { state.pending = value },
            setError: value => { state.error = value },
            setDialogOpen: value => { state.open = value },
            setNewItemName: value => { state.name = value },
            router: { refresh: () => { state.refreshed = true } },
            toast: { success: () => { state.successToast = true }, error: () => {} },
            console: { error: () => {} },
        })
        await run('collection')
        assert.equal(state.pending, false)
        assert.equal(state.refreshed, success)
        assert.equal(state.successToast, success)
        assert.equal(state.open, success ? null : 'collection')
        assert.equal(state.name, success ? '' : 'Summer')
        assert.equal(state.error, success ? null : 'Please select a workspace.')
    })
}

function settingsHarness(options) {
    const h = harness(options)
    const context = {
        exports: {},
        createItemCollection: h.create,
        createClient: async () => ({ ...h.client, from: table => ({ insert: async payload => {
            const result = await h.client.from(table).insert(payload).select().single()
            return { error: result.error }
        } }) }),
        revalidateAdminPath: value => h.refreshed.push(value),
    }
    vm.runInNewContext(settingsCode, context)
    return { ...h, create: context.exports.createCollection }
}

test('settings Add creates a workspace collection and refreshes settings', async () => {
    const h = settingsHarness()
    const result = await h.create('Summer 2026')
    assert.equal(result.success, true)
    assert.equal(h.inserts[0].organization_id, 'org-a')
    assert.ok(h.refreshed.includes('/settings'))
})

test('settings Add returns actionable failures without refreshing settings', async () => {
    const h = settingsHarness({ user: { app_metadata: {} } })
    const result = await h.create('Summer 2026')
    assert.equal(result.success, false)
    assert.match(result.error, /workspace/i)
    assert.equal(h.inserts.length, 0)
    assert.equal(h.refreshed.length, 0)
})

test('quick add persists the collection in the active workspace and returns the new option', async () => {
    const h = harness()
    const result = await h.create('  Summer 2026  ')
    assert.equal(result.success, true)
    assert.equal(result.data.id, 'collection-new')
    assert.equal(h.inserts[0].organization_id, 'org-a')
    assert.equal(h.inserts[0].name, 'Summer 2026')
    assert.equal(h.inserts[0].slug, 'summer-2026')
    assert.equal(h.serviceCalls(), 0, 'Use the authenticated client so workspace admin RLS applies')
    assert.ok(h.refreshed.includes('/items/new'))
})

test('workspace comes from the verified user, including after a workspace switch', async () => {
    const h = harness({ user: { app_metadata: { current_org_id: 'org-b' } } })
    assert.equal((await h.create('Summer')).success, true)
    assert.equal(h.inserts[0].organization_id, 'org-b')
})

for (const [label, user] of [['signed out', null], ['missing workspace', { app_metadata: {} }]]) {
    test(`rejects ${label} without inserting`, async () => {
        const h = harness({ user })
        const result = await h.create('Summer')
        assert.equal(result.success, false)
        assert.ok(result.error)
        assert.equal(h.inserts.length, 0)
    })
}

test('rejects whitespace-only names without inserting', async () => {
    const h = harness()
    assert.equal((await h.create('   ')).success, false)
    assert.equal(h.inserts.length, 0)
})

test('returns database permission errors without reporting success', async () => {
    const h = harness({ databaseError: { message: 'new row violates row-level security policy' } })
    const result = await h.create('Summer')
    assert.equal(result.success, false)
    assert.match(result.error, /row-level security/)
    assert.equal(h.refreshed.length, 0)
})

// Exercise the form's real async callback at the server-action boundary.
const formSource = ts.createSourceFile('ItemForm.tsx', fs.readFileSync(path.join(__dirname, '../../src/components/admin/ItemForm.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function findHandler(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(formSource) === 'handleQuickAddCollection') handler = node.initializer.getText(formSource)
    ts.forEachChild(node, findHandler)
}
findHandler(formSource)
assert.ok(handler, 'Collection callback must exist')
const handlerCode = ts.transpileModule(`const run = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText

function formHarness(createCollection) {
    const state = { options: [{ id: 'spring', name: 'Spring' }], pending: false, error: null, open: true, name: '  Summer  ' }
    const context = {
        newCollectionName: state.name,
        isCreatingCollection: false,
        createCollection,
        setIsCreatingCollection: value => { state.pending = value },
        setCollectionError: value => { state.error = value },
        setCollections: update => { state.options = update(state.options) },
        setValue: (field, value) => { state[field] = value },
        setIsAddingCollection: value => { state.open = value },
        setNewCollectionName: value => { state.name = value },
        toast: { success: value => { state.toast = value } },
    }
    const run = vm.runInNewContext(`${handlerCode}\nrun`, context)
    return { run, state }
}

test('form shows pending state then adds and selects the saved option', async () => {
    let resolve
    let submittedName
    const h = formHarness(name => {
        submittedName = name
        return new Promise(done => { resolve = done })
    })
    const pending = h.run()
    assert.equal(h.state.pending, true)
    assert.equal(submittedName, 'Summer')
    resolve({ success: true, data: { id: 'summer', name: 'Summer' } })
    await pending
    assert.equal(h.state.options.length, 2)
    assert.equal(h.state.collection_id, 'summer')
    assert.equal(h.state.pending, false)
    assert.equal(h.state.open, false)
    assert.equal(h.state.name, '')
    assert.ok(h.state.toast)
})

for (const failure of ['returned error', 'thrown error']) {
    test(`form keeps the name and allows retry after a ${failure}`, async () => {
        const h = formHarness(async () => {
            if (failure === 'thrown error') throw new Error('network unavailable')
            return { success: false, error: 'Collection already exists', data: null }
        })
        await h.run()
        assert.equal(h.state.pending, false)
        assert.equal(h.state.open, true)
        assert.equal(h.state.name, '  Summer  ')
        assert.equal(h.state.options.length, 1)
        assert.equal(h.state.collection_id, undefined)
        assert.ok(h.state.error)
        if (failure === 'returned error') assert.equal(h.state.error, 'Collection already exists')
    })
}
