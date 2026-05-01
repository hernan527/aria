"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// GET /api/account-permissions - Lista todas as accounts com suas permissões (apenas Super Admin)
router.get('/', async (req, res) => {
    const authReq = req;
    try {
        // Verifica se o usuário é Super Admin consultando o Chatwoot
        const profile = await chatwoot_1.default.getUserProfile(authReq.jwt, authReq.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas Super Admins podem gerenciar permissões.' });
        }
        // Busca accounts diretamente do banco de dados do Chatwoot
        const chatwootDbUrl = process.env.CHATWOOT_DATABASE_URL;
        let accounts = [];
        if (chatwootDbUrl) {
            // Se tiver conexão com banco do Chatwoot, busca direto de lá
            const { Client } = await Promise.resolve().then(() => __importStar(require('pg')));
            const client = new Client({ connectionString: chatwootDbUrl });
            try {
                await client.connect();
                const result = await client.query('SELECT id, name FROM accounts ORDER BY id');
                accounts = result.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    status: 'active'
                }));
                await client.end();
                logger_1.default.info('Accounts fetched from Chatwoot database', {
                    userId: authReq.user.id,
                    count: accounts.length
                });
            }
            catch (error) {
                logger_1.default.error('Failed to fetch from Chatwoot database', {
                    userId: authReq.user.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                await client.end().catch(() => { });
                // Fallback: busca do nosso banco
                const accountIds = await database_1.default.$queryRaw `
          SELECT DISTINCT "accountId"
          FROM (
            SELECT DISTINCT "accountId" FROM "Funnel"
            UNION
            SELECT DISTINCT "accountId" FROM "AccountPermissions"
          ) accounts
          ORDER BY "accountId"
        `;
                accounts = accountIds.map(({ accountId }) => ({
                    id: accountId,
                    name: `Account ${accountId}`,
                    status: 'active'
                }));
            }
        }
        else {
            // Sem conexão com Chatwoot DB, busca do nosso banco
            const accountIds = await database_1.default.$queryRaw `
        SELECT DISTINCT "accountId"
        FROM (
          SELECT DISTINCT "accountId" FROM "Funnel"
          UNION
          SELECT DISTINCT "accountId" FROM "AccountPermissions"
        ) accounts
        ORDER BY "accountId"
      `;
            accounts = accountIds.map(({ accountId }) => ({
                id: accountId,
                name: `Account ${accountId}`,
                status: 'active'
            }));
        }
        // Busca permissões do banco de dados
        const permissions = await database_1.default.accountPermissions.findMany();
        const permissionsMap = new Map(permissions.map(p => [p.accountId, p]));
        // Combina dados das accounts com permissões
        const accountsWithPermissions = accounts.map((account) => {
            const perms = permissionsMap.get(account.id);
            return {
                id: account.id,
                name: account.name,
                status: account.status,
                permissions: {
                    kanbanEnabled: perms?.kanbanEnabled ?? true,
                    chatsInternosEnabled: perms?.chatsInternosEnabled ?? true,
                    conexoesEnabled: perms?.conexoesEnabled ?? true,
                    projectsEnabled: perms?.projectsEnabled ?? true,
                    chatbotFlowsEnabled: perms?.chatbotFlowsEnabled ?? true,
                    wavoipEnabled: perms?.wavoipEnabled ?? false
                }
            };
        });
        logger_1.default.info('Account permissions listed', {
            userId: authReq.user.id,
            totalAccounts: accountsWithPermissions.length
        });
        res.json({ data: accountsWithPermissions });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to list account permissions', {
            userId: authReq.user.id,
            error: errorMessage
        });
        res.status(500).json({ error: 'Falha ao listar permissões das empresas' });
    }
});
// PUT /api/account-permissions/:accountId - Atualiza permissões de uma account (apenas Super Admin)
router.put('/:accountId', async (req, res) => {
    const authReq = req;
    const accountId = parseInt(req.params.accountId);
    const { kanbanEnabled, chatsInternosEnabled, conexoesEnabled, projectsEnabled, chatbotFlowsEnabled, wavoipEnabled } = req.body;
    if (isNaN(accountId)) {
        return res.status(400).json({ error: 'ID da empresa inválido' });
    }
    if (typeof kanbanEnabled !== 'boolean' ||
        typeof chatsInternosEnabled !== 'boolean' ||
        typeof conexoesEnabled !== 'boolean' ||
        typeof projectsEnabled !== 'boolean' ||
        typeof chatbotFlowsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Valores de permissões inválidos' });
    }
    try {
        // Verifica se o usuário é Super Admin
        const profile = await chatwoot_1.default.getUserProfile(authReq.jwt, authReq.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Acesso negado. Apenas Super Admins podem gerenciar permissões.' });
        }
        // Atualiza ou cria as permissões
        const permissions = await database_1.default.accountPermissions.upsert({
            where: { accountId },
            create: {
                accountId,
                kanbanEnabled,
                chatsInternosEnabled,
                conexoesEnabled,
                projectsEnabled,
                chatbotFlowsEnabled,
                wavoipEnabled: wavoipEnabled ?? false
            },
            update: {
                kanbanEnabled,
                chatsInternosEnabled,
                conexoesEnabled,
                projectsEnabled,
                chatbotFlowsEnabled,
                wavoipEnabled: wavoipEnabled !== undefined ? wavoipEnabled : undefined
            }
        });
        logger_1.default.info('Account permissions updated', {
            userId: authReq.user.id,
            accountId,
            permissions: { kanbanEnabled, chatsInternosEnabled, conexoesEnabled }
        });
        res.json({ data: permissions });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update account permissions', {
            userId: authReq.user.id,
            accountId,
            error: errorMessage
        });
        res.status(500).json({ error: 'Falha ao atualizar permissões da empresa' });
    }
});
// GET /api/account-permissions/check/:accountId - Verifica permissões de uma account específica
router.get('/check/:accountId', async (req, res) => {
    const authReq = req;
    const accountId = parseInt(req.params.accountId);
    if (isNaN(accountId)) {
        return res.status(400).json({ error: 'ID da empresa inválido' });
    }
    try {
        const permissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId }
        });
        // Se não encontrar, retorna permissões padrão (tudo habilitado)
        const result = {
            kanbanEnabled: permissions?.kanbanEnabled ?? true,
            chatsInternosEnabled: permissions?.chatsInternosEnabled ?? true,
            conexoesEnabled: permissions?.conexoesEnabled ?? true,
            projectsEnabled: permissions?.projectsEnabled ?? true,
            chatbotFlowsEnabled: permissions?.chatbotFlowsEnabled ?? true,
            wavoipEnabled: permissions?.wavoipEnabled ?? false
        };
        res.json({ data: result });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to check account permissions', {
            userId: authReq.user.id,
            accountId,
            error: errorMessage
        });
        res.status(500).json({ error: 'Falha ao verificar permissões da empresa' });
    }
});
exports.default = router;
//# sourceMappingURL=account-permissions.js.map