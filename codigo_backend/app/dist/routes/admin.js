"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Chatwoot armazena role como int no DB (1=admin, 0=agent) ou string via API
function isAdmin(req) {
    const authReq = req;
    const role = authReq.user?.role;
    return role === 'administrator' || role === 1;
}
// Middleware para verificar se é admin
function checkAdminRole(req, res, next) {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}
// ==========================================
// AGENTS (USUÁRIOS DO CHATWOOT)
// ==========================================
// GET /api/admin/agents - Lista agents (usuários) da conta no Chatwoot
// NOTA: Removida restrição de admin - necessário para configurar permissões de funis
router.get('/agents', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        logger_1.default.info('Fetching agents', {
            accountId,
            userId: authReq.user.id,
            hasJWT: !!authReq.jwt,
            hasApiToken: !!authReq.apiToken
        });
        const agents = await chatwoot_1.default.getAccountAgents(accountId, authReq.jwt, authReq.apiToken);
        logger_1.default.info('Agents fetched successfully', {
            accountId,
            userId: authReq.user.id,
            count: agents.length,
            agents: agents.map((a) => ({
                id: a.id,
                name: a.name,
                email: a.email,
                role: a.role,
                account_id: a.account_id // Log account_id de cada agente para debug
            }))
        });
        // FILTRO EXTRA: Garante que apenas agentes da conta atual sejam retornados
        // (proteção caso o Chatwoot retorne dados incorretos)
        const filteredAgents = agents.filter((a) => a.account_id === accountId);
        if (filteredAgents.length !== agents.length) {
            logger_1.default.warn('Agents from other accounts filtered out', {
                accountId,
                originalCount: agents.length,
                filteredCount: filteredAgents.length,
                removedAgents: agents.filter((a) => a.account_id !== accountId).map((a) => ({
                    id: a.id,
                    name: a.name,
                    account_id: a.account_id
                }))
            });
        }
        res.json({ data: filteredAgents });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching agents', {
            accountId: req.user?.account_id,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        });
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});
// ==========================================
// VERIFICAÇÃO DE ACESSO (para próprio usuário)
// ==========================================
// GET /api/admin/my-access - Verifica acesso do usuário atual
router.get('/my-access', async (req, res) => {
    try {
        const authReq = req;
        const { id: userId, account_id: accountId, role } = authReq.user;
        res.json({
            data: {
                hasAccess: true,
                isAdmin: true, // Removida verificação de role - todos os usuários autenticados têm acesso admin
                userId,
                accountId,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Error checking access', { error });
        res.status(500).json({ error: 'Erro ao verificar acesso' });
    }
});
// ==========================================
// PROVEDORES PERMITIDOS
// ==========================================
// GET /api/admin/allowed-providers - Busca provedores permitidos
router.get('/allowed-providers', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const permissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId },
        });
        let allowedProviders = ['evolution', 'waha', 'uazapi']; // Padrão: todos permitidos
        if (permissions?.allowedProviders) {
            try {
                allowedProviders = JSON.parse(permissions.allowedProviders);
            }
            catch (e) {
                logger_1.default.error('Failed to parse allowedProviders', { accountId, error: e });
            }
        }
        res.json({ data: allowedProviders });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching allowed providers', {
            accountId: req.user?.account_id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Erro ao buscar provedores permitidos' });
    }
});
// PATCH /api/admin/allowed-providers - Atualiza provedores permitidos (apenas admin)
router.patch('/allowed-providers', checkAdminRole, async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { providers } = req.body;
        if (!Array.isArray(providers)) {
            return res.status(400).json({ error: 'providers deve ser um array' });
        }
        // Valida que apenas evolution, waha e uazapi são permitidos
        const validProviders = providers.filter((p) => ['evolution', 'waha', 'uazapi'].includes(p));
        if (validProviders.length === 0) {
            return res.status(400).json({
                error: 'Pelo menos um provedor deve ser selecionado',
            });
        }
        // Atualiza ou cria permissões
        const updated = await database_1.default.accountPermissions.upsert({
            where: { accountId },
            update: {
                allowedProviders: JSON.stringify(validProviders),
            },
            create: {
                accountId,
                allowedProviders: JSON.stringify(validProviders),
            },
        });
        logger_1.default.info('Allowed providers updated', {
            accountId,
            userId: authReq.user.id,
            providers: validProviders,
        });
        res.json({
            success: true,
            data: validProviders,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error updating allowed providers', {
            accountId: req.user?.account_id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Erro ao atualizar provedores permitidos' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map