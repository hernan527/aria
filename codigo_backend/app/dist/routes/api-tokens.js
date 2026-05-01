"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_PERMISSIONS = void 0;
const express_1 = require("express");
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Permissões disponíveis
exports.AVAILABLE_PERMISSIONS = [
    { value: '*', label: 'Acesso Total', description: 'Todas as permissões do sistema' },
    // Kanban
    { value: 'kanban:read', label: 'Kanban: Leitura', description: 'Visualizar boards e cards' },
    { value: 'kanban:write', label: 'Kanban: Escrita', description: 'Mover cards entre colunas' },
    { value: 'cards:create', label: 'Cards: Criar', description: 'Criar novos cards no kanban' },
    { value: 'cards:update', label: 'Cards: Atualizar', description: 'Atualizar cards existentes' },
    { value: 'cards:delete', label: 'Cards: Deletar', description: 'Remover cards do kanban' },
    // Funis
    { value: 'funnels:read', label: 'Funis: Leitura', description: 'Visualizar funis e estágios' },
    { value: 'funnels:write', label: 'Funis: Escrita', description: 'Criar e editar funis e estágios' },
    { value: 'funnels:delete', label: 'Funis: Deletar', description: 'Remover funis e estágios' },
    // Projetos
    { value: 'projects:read', label: 'Projetos: Leitura', description: 'Visualizar projetos e tarefas' },
    { value: 'projects:write', label: 'Projetos: Escrita', description: 'Criar e editar projetos e tarefas' },
    { value: 'projects:delete', label: 'Projetos: Deletar', description: 'Remover projetos e tarefas' },
    // Chatbot Flows
    { value: 'chatbot:read', label: 'Chatbot: Leitura', description: 'Visualizar fluxos de chatbot' },
    { value: 'chatbot:write', label: 'Chatbot: Escrita', description: 'Criar e editar fluxos de chatbot' },
    { value: 'chatbot:delete', label: 'Chatbot: Deletar', description: 'Remover fluxos de chatbot' },
    { value: 'chatbot:execute', label: 'Chatbot: Executar', description: 'Disparar execução de fluxos' },
    // Sequências
    { value: 'sequences:read', label: 'Sequências: Leitura', description: 'Visualizar sequências de mensagens' },
    { value: 'sequences:write', label: 'Sequências: Escrita', description: 'Criar e editar sequências' },
    { value: 'sequences:delete', label: 'Sequências: Deletar', description: 'Remover sequências' },
    { value: 'sequences:execute', label: 'Sequências: Executar', description: 'Iniciar e cancelar execuções de sequências' },
    // Conexões (instâncias WhatsApp)
    { value: 'connections:read', label: 'Conexões: Leitura', description: 'Visualizar instâncias de WhatsApp' },
    { value: 'connections:write', label: 'Conexões: Escrita', description: 'Criar e configurar instâncias' },
    { value: 'connections:delete', label: 'Conexões: Deletar', description: 'Remover instâncias de WhatsApp' },
    // Chats Internos
    { value: 'chats:read', label: 'Chats Internos: Leitura', description: 'Visualizar conversas internas' },
    { value: 'chats:write', label: 'Chats Internos: Escrita', description: 'Enviar mensagens em chats internos' },
    // Agendamentos
    { value: 'calendar:read', label: 'Agenda: Leitura', description: 'Visualizar mensagens agendadas' },
    { value: 'calendar:write', label: 'Agenda: Escrita', description: 'Criar e editar agendamentos' },
    { value: 'calendar:delete', label: 'Agenda: Deletar', description: 'Remover agendamentos' },
    // Administração
    { value: 'admin:read', label: 'Admin: Leitura', description: 'Visualizar configurações administrativas' },
    { value: 'admin:write', label: 'Admin: Escrita', description: 'Alterar configurações e permissões' },
];
// GET /api/api-tokens - Lista todos os tokens do account
router.get('/', async (req, res) => {
    const authReq = req;
    try {
        const tokens = await database_1.default.apiToken.findMany({
            where: { accountId: authReq.user.account_id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                token: true,
                permissions: true,
                isActive: true,
                lastUsedAt: true,
                expiresAt: true,
                createdAt: true,
                userId: true,
            },
        });
        // Parse permissions JSON
        const tokensWithParsedPermissions = tokens.map((t) => ({
            ...t,
            permissions: JSON.parse(t.permissions),
        }));
        res.json({ success: true, data: tokensWithParsedPermissions });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to list API tokens', {
            userId: authReq.user.id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to list API tokens' });
    }
});
// POST /api/api-tokens - Cria um novo token
router.post('/', async (req, res) => {
    const authReq = req;
    const { name, permissions, expiresAt } = req.body;
    if (!name || !name.trim()) {
        res.status(400).json({ error: 'Token name is required' });
        return;
    }
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        res.status(400).json({ error: 'At least one permission is required' });
        return;
    }
    try {
        const token = (0, uuid_1.v4)();
        const apiToken = await database_1.default.apiToken.create({
            data: {
                accountId: authReq.user.account_id,
                userId: authReq.user.id,
                name: name.trim(),
                token,
                permissions: JSON.stringify(permissions),
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            },
        });
        logger_1.default.info('API token created', {
            tokenId: apiToken.id,
            accountId: authReq.user.account_id,
            userId: authReq.user.id,
            name: apiToken.name,
        });
        res.json({
            success: true,
            data: {
                ...apiToken,
                permissions: JSON.parse(apiToken.permissions),
            },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to create API token', {
            userId: authReq.user.id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to create API token' });
    }
});
// PUT /api/api-tokens/:id - Atualiza um token
router.put('/:id', async (req, res) => {
    const authReq = req;
    const tokenId = parseInt(req.params.id);
    const { name, permissions, isActive, expiresAt } = req.body;
    try {
        // Verifica se o token existe e pertence ao account
        const existing = await database_1.default.apiToken.findFirst({
            where: { id: tokenId, accountId: authReq.user.account_id },
        });
        if (!existing) {
            res.status(404).json({ error: 'API token not found' });
            return;
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (permissions !== undefined)
            updateData.permissions = JSON.stringify(permissions);
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (expiresAt !== undefined)
            updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
        const updated = await database_1.default.apiToken.update({
            where: { id: tokenId },
            data: updateData,
        });
        logger_1.default.info('API token updated', {
            tokenId,
            accountId: authReq.user.account_id,
            userId: authReq.user.id,
        });
        res.json({
            success: true,
            data: {
                ...updated,
                permissions: JSON.parse(updated.permissions),
            },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update API token', {
            tokenId,
            userId: authReq.user.id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to update API token' });
    }
});
// DELETE /api/api-tokens/:id - Deleta um token
router.delete('/:id', async (req, res) => {
    const authReq = req;
    const tokenId = parseInt(req.params.id);
    try {
        // Verifica se o token existe e pertence ao account
        const existing = await database_1.default.apiToken.findFirst({
            where: { id: tokenId, accountId: authReq.user.account_id },
        });
        if (!existing) {
            res.status(404).json({ error: 'API token not found' });
            return;
        }
        await database_1.default.apiToken.delete({
            where: { id: tokenId },
        });
        logger_1.default.info('API token deleted', {
            tokenId,
            accountId: authReq.user.account_id,
            userId: authReq.user.id,
        });
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to delete API token', {
            tokenId,
            userId: authReq.user.id,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to delete API token' });
    }
});
// GET /api/api-tokens/permissions - Lista permissões disponíveis
router.get('/permissions/available', (_req, res) => {
    res.json({ success: true, data: exports.AVAILABLE_PERMISSIONS });
});
exports.default = router;
//# sourceMappingURL=api-tokens.js.map