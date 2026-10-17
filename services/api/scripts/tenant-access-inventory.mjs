// Static coverage register, not an authorization proof. Run with --write or --check.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const relative = (file) => path.relative(root, file).replaceAll(path.sep, '/');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const schemaPath = path.join(root, 'services/api/prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');
const tables = new Map();
for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const table = match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1];
  const fields = [...match[2].matchAll(/^\s*(\w+)\s+([\w?]+)(?:\s|$)/gm)].map(m => m[1]);
  tables.set(table, { name: table, model: match[1], fields, origins: [relative(schemaPath)] });
}
const migrationFiles = walk(path.join(root, 'services/api/prisma/migrations')).filter(f => f.endsWith('.sql'));
for (const file of migrationFiles) {
  const sql = fs.readFileSync(file, 'utf8');
  // Run in migration order, including retirement and ALTER-added ownership fields.
  for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"\s*\(([\s\S]*?)\);/gi)) {
    const table = tables.get(m[1]) ?? { name: m[1], model: null, fields: [], origins: [] };
    table.fields = [...new Set([...table.fields, ...[...m[2].matchAll(/(?:^|,|\n)\s*"(\w+)"\s+(?:"?\w)/g)].map(x => x[1])])];
    table.origins.push(relative(file));
    tables.set(m[1], table);
  }
  for (const m of sql.matchAll(/ALTER TABLE\s+"([^"]+)"([\s\S]*?);/gi)) {
    const table = tables.get(m[1]);
    if (!table) continue;
    for (const field of m[2].matchAll(/ADD(?: COLUMN)?\s+(?:IF NOT EXISTS\s+)?"(\w+)"\s+"?\w/gi)) {
      if (!table.fields.includes(field[1])) table.fields.push(field[1]);
    }
  }
  for (const m of sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) tables.delete(m[1]);
}
const modelTables = new Map([...tables.values()].filter(t => t.model).map(t => [t.model[0].toLowerCase() + t.model.slice(1), t.name]));
const operations = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy']);
const sources = [...walk(path.join(root, 'services/api/src')), ...walk(path.join(root, 'services/api/scripts'))]
  .filter(file => /\.(?:ts|mjs)$/.test(file) && !/\.(?:spec|test)\.(?:ts|mjs)$/.test(file)).sort();
const accesses = [];
const routes = [];
const tenantContextCalls = [];
const policySignals = migrationFiles.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/(?:CREATE POLICY|(?:ENABLE|FORCE) ROW LEVEL SECURITY)[^;]*;/gi)].map(m => ({ file: relative(file), statement: m[0] })));
function property(node, source) {
  if (ts.isPropertyAccessExpression(node)) return { receiver: node.expression.getText(source), name: node.name.text };
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return { receiver: node.expression.getText(source), name: node.argumentExpression.text };
  }
  return null;
}
function enclosing(node, source) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isArrowFunction(p)) {
      return { name: p.name?.getText(source) ?? 'callback', text: p.getText(source) };
    }
  }
  return { name: 'module', text: source.text };
}
function signals(text) {
  return ['societyId', 'userId', 'consumerUserId', 'providerId', 'partnerId', 'withTenantContext'].filter(value => new RegExp(`\\b${value}\\b`).test(text));
}
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const variables = new WeakMap();
  function lexicalScope(node) {
    for (let p = node.parent; p; p = p.parent) if (ts.isBlock(p) || ts.isSourceFile(p)) return p;
    return source;
  }
  function index(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const scope = lexicalScope(node);
      if (!variables.has(scope)) variables.set(scope, new Map());
      variables.get(scope).set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, index);
  }
  index(source);
  function resolve(node, depth = 0) {
    if (depth < 3 && node && ts.isIdentifier(node)) {
      for (let p = node.parent; p; p = p.parent) {
        const initializer = variables.get(p)?.get(node.text);
        if (initializer && initializer.pos < node.pos) return resolve(initializer, depth + 1);
      }
    }
    return node?.getText(source) ?? '';
  }
  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
      const classDecorators = ts.canHaveDecorators(node.parent) ? ts.getDecorators(node.parent) ?? [] : [];
      const route = decorators.map(d => d.getText(source)).find(d => /^@(Get|Post|Patch|Put|Delete|Sse|Head|Options|All)\(/.test(d));
      if (route) routes.push({ file: relative(file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method: node.name.getText(source), route, boundaryEvidence: [...classDecorators, ...decorators].map(d => d.getText(source)).filter(d => /@(Controller|UseGuards|Roles|RequiresPermissions|RequiresFeature)/.test(d)), scopeSignals: signals(node.getText(source)) });
    }
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      const expression = ts.isCallExpression(node) ? node.expression : node.tag;
      const target = property(expression, source);
      if (target) {
        if (target.name === 'withTenantContext') tenantContextCalls.push({ file: relative(file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
        const raw = /^\$(queryRaw|executeRaw)(Unsafe)?$/.test(target.name);
        const modelKey = property(expression.expression, source)?.name;
        const modelTable = modelTables.get(modelKey);
        if (raw || (modelTable && operations.has(target.name))) {
          const body = ts.isCallExpression(node) ? [...node.arguments].map(n => resolve(n)).join('\n') : node.template.getText(source);
          const referenced = raw ? [...new Set([...body.matchAll(/(?:FROM|JOIN|INTO|UPDATE|DELETE FROM|TABLE)\s+"([^"]+)"/gi)].map(m => m[1]))].sort() : [modelTable];
          const owner = enclosing(node, source);
          const scopeSignals = signals(body);
          const nested = ['connect', 'connectOrCreate', 'include', 'select', 'createMany', 'updateMany'].filter(s => new RegExp(`\\b${s}\\b`).test(body));
          const utility = raw && !referenced.length && /(?:pg_(?:try_)?advisory_(?:xact_)?lock|set_config|current_setting|SELECT\s+1\b)/i.test(body);
          accesses.push({ receiver: target.receiver, queryPurpose: utility ? 'DATABASE_UTILITY' : 'TABLE_OR_INDIRECTION', file: relative(file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method: owner.name, operation: target.name, kind: raw ? 'RAW_SQL' : 'ORM', tables: referenced, queryScopeSignals: scopeSignals, enclosingScopeSignals: signals(owner.text), nestedRelationSignals: nested, disposition: target.name.endsWith('Unsafe') ? (relative(file).includes('/scripts/') ? 'DISPOSABLE_SCRIPT_UNSAFE_SQL_REVIEW' : 'P0_RUNTIME_UNSAFE_SQL_REVIEW') : utility ? 'SQL_UTILITY_SCOPE_REVIEW' : raw && !referenced.length ? 'UNRESOLVED_SQL_REVIEW' : scopeSignals.length ? 'SCOPE_SIGNAL_REQUIRES_SEMANTIC_REVIEW' : 'GLOBAL_OR_INDIRECT_SCOPE_REVIEW' });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function boundary(table) {
  if (table.name === 'Society') return 'SOCIETY_ROOT';
  if (['User', 'Session', 'OtpChallenge'].includes(table.name)) return 'IDENTITY_AUTH_GLOBAL';
  if (table.fields.includes('partnerId') || table.name === 'Partner') return 'PARTNER_CONTROL_PLANE';
  if (table.fields.includes('societyId')) return 'SOCIETY_SCOPED_OR_HYBRID';
  if (/^Consumer|^ExternalService/.test(table.name)) return 'CONSUMER_PROVIDER_RELATIONSHIP';
  if (['GovernancePollOption', 'GovernancePollResponse'].includes(table.name)) return 'SOCIETY_VIA_POLL_PARENT';
  if (/^MigrationBatch(?:Row|Artifact)$/.test(table.name)) return 'SOCIETY_VIA_MIGRATION_PARENT';
  if (table.name === 'SocietyServiceWarrantySnapshot') return 'SOCIETY_VIA_BOOKING_PARENT';
  if (table.name === 'ProviderBookingProposal') return 'SOCIETY_PROVIDER_VIA_BOOKING_PARENT';
  if (table.name === 'ProviderOnboardingApplication') return 'APPLICANT_PROVIDER_PLATFORM_REVIEW';
  if (/^ServiceProvider|^ServiceOffering|^ServiceCategory/.test(table.name)) return 'SHARED_PROVIDER_CATALOGUE_AND_PRIVATE_ADMIN';
  return 'GLOBAL_OR_PARENT_DERIVED_REVIEW';
}
const tableRegister = [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)).map(table => {
  const sites = accesses.filter(a => a.tables.includes(table.name));
  return { ...table, fields: table.fields.sort(), origins: [...new Set(table.origins)].sort(), boundary: boundary(table), modules: [...new Set(sites.map(s => s.file.split('/')[3] === 'scripts' ? 'scripts' : s.file.split('/')[4]))].sort(), reviewOwner: 'API module maintainer; Principal Architect for cross-module paths', accessSiteCount: sites.length, disposition: sites.length ? 'SEMANTIC_AUTHORIZATION_REVIEW_REQUIRED_IN_V5_2' : 'NO_DIRECT_SITE_DISCOVERED_REVIEW_INDIRECT_AND_EXTERNAL_ACCESS' };
});
const files = [...new Set([schemaPath, ...migrationFiles, ...sources])].sort();
const digest = crypto.createHash('sha256');
for (const file of files) digest.update(relative(file)).update('\0').update(fs.readFileSync(file)).update('\0');
const report = {
  schemaVersion: 1, program: 'V5', coverage: 'COMPLETE_STATIC_REGISTER', assurance: 'NOT_A_SECURITY_PROOF',
  sourceDigest: digest.digest('hex'),
  method: 'TypeScript AST ORM/raw SQL/controller extraction plus ordered Prisma schema/migration table register',
  exclusions: ['test/spec sources', 'generated/build/dependency sources', 'external database grants/policies', 'runtime-computed SQL not statically resolvable'],
  limitations: ['Scope token presence does not prove a predicate or authorization', 'Indirect repositories and dynamic SQL require semantic call-path review', 'SQL table parsing targets repository quoted DDL; new DDL forms need extractor review'],
  summary: { tables: tableRegister.length, sourceFilesScanned: sources.length, migrationFilesScanned: migrationFiles.length, accessSites: accesses.length, rawSqlSites: accesses.filter(a => a.kind === 'RAW_SQL').length, ormSites: accesses.filter(a => a.kind === 'ORM').length, routeHandlers: routes.length, unsafeSqlSites: accesses.filter(a => a.operation.endsWith('Unsafe')).length, runtimeUnsafeSqlSites: accesses.filter(a => a.disposition === 'P0_RUNTIME_UNSAFE_SQL_REVIEW').length, unresolvedSqlSites: accesses.filter(a => a.disposition === 'UNRESOLVED_SQL_REVIEW').length, utilitySqlSites: accesses.filter(a => a.queryPurpose === 'DATABASE_UTILITY').length, runtimeTenantContextCalls: tenantContextCalls.length, migrationPolicySignals: policySignals.length },
  tenantContextCalls, policySignals,
  tables: tableRegister, accesses, routes,
};
const output = path.join(root, 'docs/architecture/v5-tenant-access-inventory.json');
const { tables: tableRows, accesses: accessRows, routes: routeRows, ...header } = report;
const arrays = [['tables', tableRows], ['accesses', accessRows], ['routes', routeRows]];
const rendered = JSON.stringify(header, null, 2).slice(0, -2) + ',\n' + arrays.map(([key, rows]) => `  "${key}": [\n${rows.map(row => '    ' + JSON.stringify(row)).join(',\n')}\n  ]`).join(',\n') + '\n}\n';
if (process.argv.includes('--write')) fs.writeFileSync(output, rendered);
else if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== rendered) throw new Error('Tenant-access inventory is stale. Regenerate with --write and review scope changes.');
console.log(JSON.stringify(report.summary));
