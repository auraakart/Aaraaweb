import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function requireTokens(label,content,tokens){const missing=tokens.filter(token=>!content.includes(token));if(missing.length)throw new Error(`${label} missing: ${missing.join(', ')}`)}
const service=read('services/api/src/documents/documents.service.ts');
const assistant=read('services/api/src/ai-operations/ai-assistant.service.ts')+read('services/api/src/ai-operations/ai-society-insights.ts')+read('services/api/src/ai-operations/ai-assistant.policy.ts');
const admin=read('apps/admin/app/documents/page.tsx');
const migration=read('services/api/prisma/migrations/20260929090000_v4790_society_knowledge_ai/migration.sql');
requireTokens('Document knowledge storage',migration,['"SocietyDocumentKnowledge"','contentHash','text_length_check','scope_guard']);
requireTokens('Document knowledge service',service,['normalizeKnowledgeText','searchKnowledgeForUser','SocietyDocumentKnowledge',"d.\"status\"='PUBLISHED'","d.\"audience\"='PROPERTY_OWNER_ONLY'","createHash('sha256')",'slice(0,5)']);
requireTokens('Permission-aware assistant',assistant,["'SOCIETY_KNOWLEDGE'",'AppPermission.DOCUMENTS_READ','AppPermission.NOTICE_READ','searchKnowledgeForUser','No matching published society document was found',"['SocietyDocument','SocietyDocumentKnowledge']"]);
requireTokens('Admin reviewed-text workflow',admin,['Reviewed knowledge text (optional)','knowledgeText:knowledgeText.trim()||undefined','Society Knowledge AI: reviewed text attached to this version']);
if(service.includes('SELECT d.*, k."contentText"'))throw new Error('Knowledge text must not be added to the general document list payload.');
console.log('V4.79.0 society knowledge AI contract OK');
