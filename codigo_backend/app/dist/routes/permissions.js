"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const router = (0, express_1.Router)();
/**
 * GET /api/permissions/users
 * Lista todos os usuários da empresa com suas permissões
 */
router.get('/users', async (req, res) => {
    try {
        const accountId = req.accountId;
        const jwt = req.jwt;
        const apiToken = req.apiToken;
        // Buscar usuários do Chatwoot via serviço
        const users = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        // Buscar permissões de cada usuário
        const permissions = await database_1.default.userResourcePermission.findMany({
            where: { accountId }
        });
        // Combinar dados
        const usersWithPermissions = users.map((user) => {
            const userPerm = permissions.find(p => p.userId === user.id);
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: userPerm || {
                    kanbanAccess: true,
                    conexoesAccess: true,
                    chatsInternosAccess: true,
                    projectsAccess: true,
                    chatbotFlowsAccess: true,
                    wavoipAccess: true,
                    permissoesAccess: user.role === 'administrator' || user.role === 1
                }
            };
        });
        res.json({
            success: true,
            data: usersWithPermissions
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching users permissions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users permissions'
        });
    }
});
/**
 * GET /api/permissions/user/:userId
 * Busca permissões de um usuário específico
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = parseInt(req.params.userId);
        let permissions = await database_1.default.userResourcePermission.findUnique({
            where: {
                accountId_userId: {
                    accountId,
                    userId
                }
            }
        });
        // Se não existir, retorna permissões padrão (COM acesso - permissivo)
        // O admin pode restringir usuários específicos se quiser
        if (!permissions) {
            permissions = {
                id: 0,
                accountId,
                userId,
                kanbanAccess: true,
                conexoesAccess: true,
                chatsInternosAccess: true,
                projectsAccess: true,
                chatbotFlowsAccess: true,
                wavoipAccess: true,
                permissoesAccess: false, // Apenas permissões continuam false por padrão
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }
        res.json({
            success: true,
            data: permissions
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching user permissions', { error, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user permissions'
        });
    }
});
/**
 * PUT /api/permissions/user/:userId
 * Atualiza permissões de um usuário
 */
router.put('/user/:userId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = parseInt(req.params.userId);
        const { kanbanAccess, conexoesAccess, chatsInternosAccess, projectsAccess, chatbotFlowsAccess, wavoipAccess, permissoesAccess } = req.body;
        const permissions = await database_1.default.userResourcePermission.upsert({
            where: {
                accountId_userId: {
                    accountId,
                    userId
                }
            },
            update: {
                kanbanAccess: kanbanAccess !== undefined ? kanbanAccess : undefined,
                conexoesAccess: conexoesAccess !== undefined ? conexoesAccess : undefined,
                chatsInternosAccess: chatsInternosAccess !== undefined ? chatsInternosAccess : undefined,
                projectsAccess: projectsAccess !== undefined ? projectsAccess : undefined,
                chatbotFlowsAccess: chatbotFlowsAccess !== undefined ? chatbotFlowsAccess : undefined,
                wavoipAccess: wavoipAccess !== undefined ? wavoipAccess : undefined,
                permissoesAccess: permissoesAccess !== undefined ? permissoesAccess : undefined,
                updatedAt: new Date()
            },
            create: {
                accountId,
                userId,
                kanbanAccess: kanbanAccess !== undefined ? kanbanAccess : true,
                conexoesAccess: conexoesAccess !== undefined ? conexoesAccess : true,
                chatsInternosAccess: chatsInternosAccess !== undefined ? chatsInternosAccess : true,
                projectsAccess: projectsAccess !== undefined ? projectsAccess : true,
                chatbotFlowsAccess: chatbotFlowsAccess !== undefined ? chatbotFlowsAccess : true,
                wavoipAccess: wavoipAccess !== undefined ? wavoipAccess : true,
                permissoesAccess: permissoesAccess !== undefined ? permissoesAccess : false
            }
        });
        logger_1.default.info('User permissions updated', { accountId, userId, permissions });
        res.json({
            success: true,
            data: permissions
        });
    }
    catch (error) {
        logger_1.default.error('Error updating user permissions', { error, userId: req.params.userId });
        res.status(500).json({
            success: false,
            error: 'Failed to update user permissions'
        });
    }
});
/**
 * GET /api/permissions/me
 * Retorna as permissões do usuário logado
 */
router.get('/me', async (req, res) => {
    try {
        const userId = req.userId;
        const accountId = req.accountId;
        let permissions = await database_1.default.userResourcePermission.findUnique({
            where: {
                accountId_userId: {
                    accountId,
                    userId
                }
            }
        });
        // Se não existir, retorna permissões padrão (COM acesso - permissivo)
        // O admin pode restringir usuários específicos se quiser
        if (!permissions) {
            permissions = {
                id: 0,
                accountId,
                userId,
                kanbanAccess: true,
                conexoesAccess: true,
                chatsInternosAccess: true,
                projectsAccess: true,
                chatbotFlowsAccess: true,
                wavoipAccess: true,
                permissoesAccess: false, // Apenas permissões continuam false por padrão
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }
        res.json({
            success: true,
            data: permissions
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching current user permissions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch permissions'
        });
    }
});
/**
 * GET /api/permissions/resources
 * Lista recursos disponíveis para gerenciamento de permissões
 * Filtra baseado nas permissões da conta (AccountPermissions)
 */
router.get('/resources', async (req, res) => {
    try {
        const accountId = req.accountId;
        // Busca as permissões da conta (definidas pelo Super Admin)
        const accountPermissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId }
        });
        // Todos os recursos possíveis
        const allResources = [
            {
                key: 'kanbanAccess',
                name: 'Kanban',
                description: 'Acesso ao quadro Kanban de conversas',
                icon: '📊',
                enabledField: 'kanbanEnabled'
            },
            {
                key: 'conexoesAccess',
                name: 'Conexões',
                description: 'Gerenciamento de instâncias WhatsApp',
                icon: '🔌',
                enabledField: 'conexoesEnabled'
            },
            {
                key: 'chatsInternosAccess',
                name: 'Chats Internos',
                description: 'Conversas internas entre a equipe',
                icon: '💬',
                enabledField: 'chatsInternosEnabled'
            },
            {
                key: 'projectsAccess',
                name: 'Projetos',
                description: 'Gerenciamento de projetos e tarefas',
                icon: '📁',
                enabledField: 'projectsEnabled'
            },
            {
                key: 'chatbotFlowsAccess',
                name: 'Chatbot Flows',
                description: 'Editor de fluxos de chatbot',
                icon: '🤖',
                enabledField: 'chatbotFlowsEnabled'
            },
            {
                key: 'wavoipAccess',
                name: 'Chamadas',
                description: 'Realizar e receber chamadas WhatsApp via Wavoip',
                icon: '📞',
                enabledField: 'wavoipEnabled'
            },
            {
                key: 'permissoesAccess',
                name: 'Permissões',
                description: 'Gerenciamento de permissões (apenas admin)',
                icon: '🔐',
                enabledField: null // Sempre disponível
            }
        ];
        // Se não existe AccountPermissions, retorna todos (comportamento padrão)
        if (!accountPermissions) {
            const resources = allResources.map(({ enabledField, ...resource }) => resource);
            return res.json({
                success: true,
                data: resources
            });
        }
        // Filtra recursos baseado nas permissões da conta
        const enabledResources = allResources.filter(resource => {
            // Permissões sempre disponível
            if (!resource.enabledField)
                return true;
            // Verifica se o recurso está habilitado para a conta
            return accountPermissions[resource.enabledField] === true;
        });
        // Remove o campo enabledField antes de retornar
        const resources = enabledResources.map(({ enabledField, ...resource }) => resource);
        res.json({
            success: true,
            data: resources
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching available resources', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch resources'
        });
    }
});
/**
 * POST /api/permissions/initialize-account
 * Inicializa permissões para todos os usuários da conta (migração/setup)
 * Cria registros com TODAS as permissões habilitadas para usuários sem registro
 */
router.post('/initialize-account', async (req, res) => {
    try {
        const accountId = req.accountId;
        // Busca todos os usuários da conta via Chatwoot API
        const authReq = req;
        const agents = await chatwoot_1.default.getAccountAgents(accountId, authReq.jwt, authReq.apiToken);
        let created = 0;
        let skipped = 0;
        for (const agent of agents) {
            // Verifica se já existe permissão
            const existing = await database_1.default.userResourcePermission.findUnique({
                where: {
                    accountId_userId: {
                        accountId,
                        userId: agent.id
                    }
                }
            });
            if (existing) {
                skipped++;
                continue;
            }
            // Cria com todas as permissões habilitadas (exceto permissoesAccess)
            await database_1.default.userResourcePermission.create({
                data: {
                    accountId,
                    userId: agent.id,
                    kanbanAccess: true,
                    conexoesAccess: true,
                    chatsInternosAccess: true,
                    projectsAccess: true,
                    chatbotFlowsAccess: true,
                    permissoesAccess: agent.role === 'administrator' || agent.role === 1 // Apenas admins
                }
            });
            created++;
        }
        logger_1.default.info('Account permissions initialized', { accountId, created, skipped });
        res.json({
            success: true,
            data: {
                created,
                skipped,
                total: agents.length
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error initializing account permissions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to initialize permissions'
        });
    }
});
/**
 * GET /api/permissions/account
 * Retorna as configurações de permissões em nível de empresa
 */
router.get('/account', async (req, res) => {
    try {
        const accountId = req.accountId;
        let accountPermissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId }
        });
        // Se não existir, cria com valores padrão (tudo habilitado)
        if (!accountPermissions) {
            accountPermissions = await database_1.default.accountPermissions.create({
                data: {
                    accountId,
                    kanbanEnabled: true,
                    chatsInternosEnabled: true,
                    conexoesEnabled: true,
                    projectsEnabled: true,
                    chatbotFlowsEnabled: true,
                    wavoipEnabled: false
                }
            });
        }
        res.json({
            success: true,
            data: accountPermissions
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching account permissions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch account permissions'
        });
    }
});
/**
 * PUT /api/permissions/account
 * Atualiza as configurações de permissões em nível de empresa
 * IMPORTANTE: Estas configurações afetam TODOS os usuários da empresa
 */
router.put('/account', async (req, res) => {
    try {
        const accountId = req.accountId;
        const { kanbanEnabled, chatsInternosEnabled, conexoesEnabled, projectsEnabled, chatbotFlowsEnabled, wavoipEnabled, allowedProviders } = req.body;
        const accountPermissions = await database_1.default.accountPermissions.upsert({
            where: { accountId },
            update: {
                kanbanEnabled: kanbanEnabled !== undefined ? kanbanEnabled : undefined,
                chatsInternosEnabled: chatsInternosEnabled !== undefined ? chatsInternosEnabled : undefined,
                conexoesEnabled: conexoesEnabled !== undefined ? conexoesEnabled : undefined,
                projectsEnabled: projectsEnabled !== undefined ? projectsEnabled : undefined,
                chatbotFlowsEnabled: chatbotFlowsEnabled !== undefined ? chatbotFlowsEnabled : undefined,
                wavoipEnabled: wavoipEnabled !== undefined ? wavoipEnabled : undefined,
                allowedProviders: allowedProviders !== undefined ? allowedProviders : undefined,
                updatedAt: new Date()
            },
            create: {
                accountId,
                kanbanEnabled: kanbanEnabled !== undefined ? kanbanEnabled : true,
                chatsInternosEnabled: chatsInternosEnabled !== undefined ? chatsInternosEnabled : true,
                conexoesEnabled: conexoesEnabled !== undefined ? conexoesEnabled : true,
                projectsEnabled: projectsEnabled !== undefined ? projectsEnabled : true,
                chatbotFlowsEnabled: chatbotFlowsEnabled !== undefined ? chatbotFlowsEnabled : true,
                wavoipEnabled: wavoipEnabled !== undefined ? wavoipEnabled : false,
                allowedProviders: allowedProviders || null
            }
        });
        logger_1.default.info('Account permissions updated', { accountId, accountPermissions });
        res.json({
            success: true,
            data: accountPermissions
        });
    }
    catch (error) {
        logger_1.default.error('Error updating account permissions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update account permissions'
        });
    }
});
exports.default = router;
//# sourceMappingURL=permissions.js.map