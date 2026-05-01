"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const chatwootDatabase_1 = __importDefault(require("../services/chatwootDatabase"));
const encryption_1 = require("../utils/encryption");
const router = (0, express_1.Router)();
/**
 * @swagger
 * /v1/kanban/boards:
 *   get:
 *     summary: Lista todos os funis/boards disponíveis
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de funis
 */
router.get('/kanban/boards', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    try {
        const funnels = await database_1.default.funnel.findMany({
            where: { accountId },
            include: {
                stages: {
                    orderBy: { order: 'asc' },
                },
            },
            orderBy: { order: 'asc' },
        });
        res.json({
            success: true,
            data: funnels.map((f) => ({
                id: f.id,
                name: f.name,
                color: f.color,
                isSystem: f.isSystem,
                isPublic: f.isPublic,
                stages: f.stages.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    chatwootStatus: s.chatwootStatus,
                })),
            })),
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to list boards', {
            accountId,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to list boards' });
    }
});
/**
 * @swagger
 * /v1/kanban/boards/{boardId}/cards:
 *   get:
 *     summary: Lista cards de um board específico
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/kanban/boards/:boardId/cards', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const boardId = parseInt(req.params.boardId);
    try {
        // Verifica se o board existe e pertence ao account
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: boardId, accountId },
            include: {
                stages: {
                    include: {
                        cards: {
                            orderBy: { order: 'asc' },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
            },
        });
        if (!funnel) {
            res.status(404).json({ error: 'Board not found' });
            return;
        }
        // Busca conversas do Chatwoot (TODO: implementar auth via token também)
        // Por enquanto retorna apenas os IDs das conversas
        const result = {
            id: funnel.id,
            name: funnel.name,
            stages: funnel.stages.map((stage) => ({
                id: stage.id,
                name: stage.name,
                color: stage.color,
                cards: stage.cards.map((card) => ({
                    conversationId: card.conversationId,
                    order: card.order,
                    createdAt: card.createdAt,
                })),
            })),
        };
        res.json({ success: true, data: result });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to list board cards', {
            boardId,
            accountId,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to list board cards' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards:
 *   post:
 *     summary: Cria um novo card no Kanban
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stageId
 *             properties:
 *               conversationId:
 *                 type: integer
 *                 description: ID da conversa (obrigatório se contactId não for informado)
 *               contactId:
 *                 type: integer
 *                 description: ID do contato (usa a conversa mais recente; obrigatório se conversationId não for informado)
 *               stageId:
 *                 type: integer
 */
router.post('/kanban/cards', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    let conversationId = req.body.conversationId ? parseInt(String(req.body.conversationId), 10) : NaN;
    const stageId = parseInt(String(req.body.stageId), 10);
    const contactId = req.body.contactId ? parseInt(String(req.body.contactId), 10) : NaN;
    if (!req.body.conversationId && !req.body.contactId) {
        res.status(400).json({ error: 'conversationId or contactId is required, along with stageId' });
        return;
    }
    if (!req.body.stageId) {
        res.status(400).json({ error: 'stageId is required' });
        return;
    }
    if (isNaN(stageId)) {
        res.status(400).json({ error: 'stageId must be an integer' });
        return;
    }
    // Resolve contactId → conversationId (conversa mais recente)
    if (isNaN(conversationId) && !isNaN(contactId)) {
        try {
            let conversations = [];
            try {
                conversations = await chatwootDatabase_1.default.getContactConversations(accountId, contactId);
            }
            catch {
                const userId = apiReq.apiTokenData.userId;
                const userApiToken = await chatwootDatabase_1.default.getUserAccessToken(userId);
                if (userApiToken) {
                    const result = await chatwoot_1.default.getContactConversations(accountId, contactId, userApiToken);
                    conversations = (result || []).map((c) => ({ id: c.id }));
                }
            }
            if (!conversations || conversations.length === 0) {
                res.status(404).json({ error: 'No conversations found for this contact' });
                return;
            }
            conversationId = conversations[0].id;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('API: Failed to resolve contactId to conversationId', { contactId, accountId, error: errorMessage });
            res.status(500).json({ error: 'Failed to resolve contact conversations' });
            return;
        }
    }
    if (isNaN(conversationId) || conversationId <= 0) {
        res.status(400).json({ error: 'conversationId must be a valid integer' });
        return;
    }
    try {
        // Verifica se o stage existe e pertence ao account
        const stage = await database_1.default.stage.findFirst({
            where: { id: stageId },
            include: { funnel: true },
        });
        if (!stage || stage.funnel.accountId !== accountId) {
            res.status(404).json({ error: 'Stage not found' });
            return;
        }
        // Verifica se já existe card para esta conversa
        const existing = await database_1.default.card.findUnique({
            where: {
                conversationId_accountId: {
                    conversationId,
                    accountId,
                },
            },
        });
        if (existing) {
            res.status(409).json({ error: 'Card already exists for this conversation' });
            return;
        }
        // Conta cards existentes no stage para definir ordem
        const cardsCount = await database_1.default.card.count({
            where: { stageId },
        });
        const card = await database_1.default.card.create({
            data: {
                conversationId,
                stageId,
                accountId,
                order: cardsCount,
            },
        });
        logger_1.default.info('API: Card created', {
            cardId: card.id,
            conversationId,
            stageId,
            accountId,
        });
        res.json({ success: true, data: card });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to create card', {
            conversationId,
            stageId,
            accountId,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to create card' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards:
 *   put:
 *     summary: Move um card para outro stage por contactId ou conversationId (body)
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stageId
 *             properties:
 *               conversationId:
 *                 type: integer
 *               contactId:
 *                 type: integer
 *               stageId:
 *                 type: integer
 */
router.put('/kanban/cards', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    let conversationId = req.body.conversationId ? parseInt(String(req.body.conversationId), 10) : NaN;
    const stageId = parseInt(String(req.body.stageId), 10);
    const contactId = req.body.contactId ? parseInt(String(req.body.contactId), 10) : NaN;
    if (!req.body.conversationId && !req.body.contactId) {
        res.status(400).json({ error: 'conversationId or contactId is required' });
        return;
    }
    if (!req.body.stageId || isNaN(stageId)) {
        res.status(400).json({ error: 'stageId is required and must be an integer' });
        return;
    }
    // Resolve contactId → card (busca entre TODAS las conversaciones del contacto la que tiene card)
    let card = null;
    if (isNaN(conversationId) && !isNaN(contactId)) {
        try {
            let conversations = [];
            try {
                conversations = await chatwootDatabase_1.default.getContactConversations(accountId, contactId);
            }
            catch {
                const userId = apiReq.apiTokenData.userId;
                const userApiToken = await chatwootDatabase_1.default.getUserAccessToken(userId);
                if (userApiToken) {
                    const result = await chatwoot_1.default.getContactConversations(accountId, contactId, userApiToken);
                    conversations = (result || []).map((c) => ({ id: c.id }));
                }
            }
            if (!conversations || conversations.length === 0) {
                res.status(404).json({ error: 'No conversations found for this contact' });
                return;
            }
            // Buscar cuál de las conversaciones tiene un card en el kanban
            const convIds = conversations.map((c) => c.id);
            card = await database_1.default.card.findFirst({
                where: { accountId, conversationId: { in: convIds } },
                orderBy: { updatedAt: 'desc' },
            });
            if (!card) {
                // No hay card para ninguna conversación del contacto — continuar sin error
                res.json({ success: true, found: false, message: 'No kanban card found for this contact' });
                return;
            }
            conversationId = card.conversationId;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('API: Failed to resolve contactId to card', { contactId, accountId, error: errorMessage });
            res.status(500).json({ error: 'Failed to resolve contact card' });
            return;
        }
    }
    if (isNaN(conversationId) || conversationId <= 0) {
        res.status(400).json({ error: 'conversationId must be a valid integer' });
        return;
    }
    try {
        if (!card) {
            card = await database_1.default.card.findUnique({
                where: { conversationId_accountId: { conversationId, accountId } },
            });
        }
        const targetStage = await database_1.default.stage.findFirst({
            where: { id: stageId },
            include: { funnel: true },
        });
        if (!targetStage || targetStage.funnel.accountId !== accountId) {
            res.status(404).json({ error: 'Target stage not found' });
            return;
        }
        const cardsCount = await database_1.default.card.count({ where: { stageId } });
        let result;
        let created = false;
        if (card) {
            result = await database_1.default.card.update({
                where: { id: card.id },
                data: { stageId, order: cardsCount },
            });
            logger_1.default.info('API: Card moved via body', { cardId: card.id, conversationId, fromStageId: card.stageId, toStageId: stageId, accountId });
        }
        else {
            result = await database_1.default.card.create({
                data: { conversationId, stageId, accountId, order: cardsCount },
            });
            created = true;
            logger_1.default.info('API: Card created via upsert', { cardId: result.id, conversationId, stageId, accountId });
        }
        res.json({ success: true, created, data: result });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to move card via body', { conversationId, stageId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to move card' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards/{conversationId}/move:
 *   put:
 *     summary: Move um card para outro stage
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stageId
 *             properties:
 *               stageId:
 *                 type: integer
 */
router.put('/kanban/cards/:conversationId/move', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const conversationId = parseInt(req.params.conversationId, 10);
    const stageId = parseInt(String(req.body.stageId), 10);
    if (!req.body.stageId) {
        res.status(400).json({ error: 'stageId is required' });
        return;
    }
    if (isNaN(stageId)) {
        res.status(400).json({ error: 'stageId must be an integer' });
        return;
    }
    try {
        // Busca o card
        const card = await database_1.default.card.findUnique({
            where: {
                conversationId_accountId: {
                    conversationId,
                    accountId,
                },
            },
        });
        if (!card) {
            res.status(404).json({ error: 'Card not found' });
            return;
        }
        // Verifica se o stage de destino existe e pertence ao account
        const targetStage = await database_1.default.stage.findFirst({
            where: { id: stageId },
            include: { funnel: true },
        });
        if (!targetStage || targetStage.funnel.accountId !== accountId) {
            res.status(404).json({ error: 'Target stage not found' });
            return;
        }
        // Conta cards no stage de destino para definir nova ordem
        const cardsCount = await database_1.default.card.count({
            where: { stageId },
        });
        // Move o card
        const updated = await database_1.default.card.update({
            where: { id: card.id },
            data: {
                stageId,
                order: cardsCount,
            },
        });
        logger_1.default.info('API: Card moved', {
            cardId: card.id,
            conversationId,
            fromStageId: card.stageId,
            toStageId: stageId,
            accountId,
        });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to move card', {
            conversationId,
            stageId,
            accountId,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to move card' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards/{conversationId}:
 *   delete:
 *     summary: Remove um card do Kanban
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/kanban/cards/:conversationId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const conversationId = parseInt(req.params.conversationId);
    try {
        const card = await database_1.default.card.findUnique({
            where: {
                conversationId_accountId: {
                    conversationId,
                    accountId,
                },
            },
        });
        if (!card) {
            res.status(404).json({ error: 'Card not found' });
            return;
        }
        await database_1.default.card.delete({
            where: { id: card.id },
        });
        logger_1.default.info('API: Card deleted', {
            cardId: card.id,
            conversationId,
            accountId,
        });
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to delete card', {
            conversationId,
            accountId,
            error: errorMessage,
        });
        res.status(500).json({ error: 'Failed to delete card' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards/{conversationId}:
 *   get:
 *     summary: Busca card por conversation ID
 *     description: Retorna os dados do card (funil, etapa, status) para uma conversa específica
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da conversa no Chatwoot
 *     responses:
 *       200:
 *         description: Dados do card
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: integer
 *                     stageId:
 *                       type: integer
 *                     stageName:
 *                       type: string
 *                     funnelId:
 *                       type: integer
 *                     funnelName:
 *                       type: string
 *                     leadStatus:
 *                       type: string
 *                       enum: [open, won, lost]
 *                     customName:
 *                       type: string
 *                     order:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *       404:
 *         description: Card não encontrado para esta conversa
 */
router.get('/kanban/cards/:conversationId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
        res.status(400).json({ error: 'Invalid conversationId' });
        return;
    }
    try {
        const card = await database_1.default.card.findUnique({
            where: {
                conversationId_accountId: { conversationId, accountId },
            },
            include: {
                stage: {
                    include: { funnel: true },
                },
            },
        });
        if (!card) {
            res.status(404).json({ error: 'Card not found for this conversation' });
            return;
        }
        res.json({
            success: true,
            data: {
                conversationId: card.conversationId,
                stageId: card.stage.id,
                stageName: card.stage.name,
                stageColor: card.stage.color,
                funnelId: card.stage.funnel.id,
                funnelName: card.stage.funnel.name,
                leadStatus: card.leadStatus || 'open',
                customName: card.customName || null,
                order: card.order,
                createdAt: card.createdAt,
                updatedAt: card.updatedAt,
            },
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to get card', { conversationId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to get card' });
    }
});
/**
 * @swagger
 * /v1/kanban/cards/by-contact/{contactId}:
 *   get:
 *     summary: Busca todos os cards de um contato
 *     description: Retorna todos os cards (funil, etapa, status) de todas as conversas de um contato
 *     tags: [Kanban]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do contato no Chatwoot
 *     responses:
 *       200:
 *         description: Lista de cards do contato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       conversationId:
 *                         type: integer
 *                       stageId:
 *                         type: integer
 *                       stageName:
 *                         type: string
 *                       funnelId:
 *                         type: integer
 *                       funnelName:
 *                         type: string
 *                       leadStatus:
 *                         type: string
 */
router.get('/kanban/cards/by-contact/:contactId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const contactId = parseInt(req.params.contactId);
    if (isNaN(contactId)) {
        res.status(400).json({ error: 'Invalid contactId' });
        return;
    }
    try {
        // Busca conversas do contato diretamente no banco do Chatwoot
        let conversationIds = [];
        try {
            const contactConversations = await chatwootDatabase_1.default.getContactConversations(accountId, contactId);
            conversationIds = (contactConversations || []).map((c) => c.id);
        }
        catch {
            // Fallback: tenta via API usando o token do usuário
            try {
                const userId = apiReq.apiTokenData.userId;
                const userApiToken = await chatwootDatabase_1.default.getUserAccessToken(userId);
                if (userApiToken) {
                    const contactConversations = await chatwoot_1.default.getContactConversations(accountId, contactId, userApiToken);
                    conversationIds = (contactConversations || []).map((c) => c.id);
                }
            }
            catch {
                res.status(404).json({ error: 'Contact not found or no conversations' });
                return;
            }
        }
        if (conversationIds.length === 0) {
            res.json({ success: true, data: [] });
            return;
        }
        // Busca cards do KanbanCW para essas conversas
        const cards = await database_1.default.card.findMany({
            where: {
                accountId,
                conversationId: { in: conversationIds },
            },
            include: {
                stage: {
                    include: { funnel: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json({
            success: true,
            data: cards.map((card) => ({
                conversationId: card.conversationId,
                stageId: card.stage.id,
                stageName: card.stage.name,
                stageColor: card.stage.color,
                funnelId: card.stage.funnel.id,
                funnelName: card.stage.funnel.name,
                leadStatus: card.leadStatus || 'open',
                customName: card.customName || null,
                order: card.order,
                createdAt: card.createdAt,
                updatedAt: card.updatedAt,
            })),
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to get cards by contact', { contactId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to get cards by contact' });
    }
});
// ==================== FUNIS ====================
/**
 * @swagger
 * /v1/funnels:
 *   post:
 *     summary: Cria um novo funil
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 */
router.post('/funnels', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const { name, color, isPublic } = req.body;
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    try {
        const maxOrder = await database_1.default.funnel.findFirst({
            where: { accountId },
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        const funnel = await database_1.default.funnel.create({
            data: {
                accountId,
                name,
                color: color || '#3B82F6',
                isPublic: isPublic ?? true,
                isSystem: false,
                order: (maxOrder?.order ?? -1) + 1,
            },
        });
        logger_1.default.info('API: Funnel created', { funnelId: funnel.id, accountId });
        res.json({ success: true, data: funnel });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to create funnel', { accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to create funnel' });
    }
});
/**
 * @swagger
 * /v1/funnels/{funnelId}:
 *   put:
 *     summary: Atualiza um funil
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 */
router.put('/funnels/:funnelId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const funnelId = parseInt(req.params.funnelId);
    const { name, color, isPublic } = req.body;
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId },
        });
        if (!funnel) {
            res.status(404).json({ error: 'Funnel not found' });
            return;
        }
        const updated = await database_1.default.funnel.update({
            where: { id: funnelId },
            data: {
                ...(name && { name }),
                ...(color && { color }),
                ...(isPublic !== undefined && { isPublic }),
            },
        });
        logger_1.default.info('API: Funnel updated', { funnelId, accountId });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to update funnel', { funnelId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to update funnel' });
    }
});
/**
 * @swagger
 * /v1/funnels/{funnelId}:
 *   delete:
 *     summary: Remove um funil
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/funnels/:funnelId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const funnelId = parseInt(req.params.funnelId);
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId, isSystem: false },
        });
        if (!funnel) {
            res.status(404).json({ error: 'Funnel not found or cannot be deleted' });
            return;
        }
        await database_1.default.funnel.delete({
            where: { id: funnelId },
        });
        logger_1.default.info('API: Funnel deleted', { funnelId, accountId });
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to delete funnel', { funnelId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to delete funnel' });
    }
});
// ==================== STAGES ====================
/**
 * @swagger
 * /v1/funnels/{funnelId}/stages:
 *   post:
 *     summary: Cria um novo stage em um funil
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 */
router.post('/funnels/:funnelId/stages', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const funnelId = parseInt(req.params.funnelId);
    const { name, color } = req.body;
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId },
        });
        if (!funnel) {
            res.status(404).json({ error: 'Funnel not found' });
            return;
        }
        const maxOrder = await database_1.default.stage.findFirst({
            where: { funnelId },
            orderBy: { order: 'desc' },
            select: { order: true },
        });
        const stage = await database_1.default.stage.create({
            data: {
                funnelId,
                name,
                color: color || '#10B981',
                order: (maxOrder?.order ?? -1) + 1,
            },
        });
        logger_1.default.info('API: Stage created', { stageId: stage.id, funnelId, accountId });
        res.json({ success: true, data: stage });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to create stage', { funnelId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to create stage' });
    }
});
/**
 * @swagger
 * /v1/stages/{stageId}:
 *   put:
 *     summary: Atualiza um stage
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 */
router.put('/stages/:stageId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const stageId = parseInt(req.params.stageId);
    const { name, color } = req.body;
    try {
        const stage = await database_1.default.stage.findFirst({
            where: { id: stageId },
            include: { funnel: true },
        });
        if (!stage || stage.funnel.accountId !== accountId) {
            res.status(404).json({ error: 'Stage not found' });
            return;
        }
        const updated = await database_1.default.stage.update({
            where: { id: stageId },
            data: {
                ...(name && { name }),
                ...(color && { color }),
            },
        });
        logger_1.default.info('API: Stage updated', { stageId, accountId });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to update stage', { stageId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to update stage' });
    }
});
/**
 * @swagger
 * /v1/stages/{stageId}:
 *   delete:
 *     summary: Remove um stage
 *     tags: [Funis]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/stages/:stageId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const stageId = parseInt(req.params.stageId);
    try {
        const stage = await database_1.default.stage.findFirst({
            where: { id: stageId },
            include: { funnel: true },
        });
        if (!stage || stage.funnel.accountId !== accountId) {
            res.status(404).json({ error: 'Stage not found' });
            return;
        }
        await database_1.default.stage.delete({
            where: { id: stageId },
        });
        logger_1.default.info('API: Stage deleted', { stageId, accountId });
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to delete stage', { stageId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to delete stage' });
    }
});
// ==================== CONEXÕES ====================
// Nota: Modelo Connection não existe no schema Prisma atual
// As rotas de conexões foram removidas temporariamente
// ==================== AGENDAMENTOS ====================
/**
 * @swagger
 * /v1/scheduled-messages:
 *   get:
 *     summary: Lista mensagens agendadas
 *     tags: [Agendamentos]
 *     security:
 *       - BearerAuth: []
 */
router.get('/scheduled-messages', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    try {
        const messages = await database_1.default.scheduledMessage.findMany({
            where: { accountId },
            orderBy: { scheduledAt: 'asc' },
        });
        res.json({ success: true, data: messages });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to list scheduled messages', { accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to list scheduled messages' });
    }
});
/**
 * @swagger
 * /v1/scheduled-messages:
 *   post:
 *     summary: Cria uma mensagem agendada
 *     tags: [Agendamentos]
 *     security:
 *       - BearerAuth: []
 */
router.post('/scheduled-messages', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const userId = apiReq.apiTokenData.userId;
    const { conversationId, message, scheduledAt } = req.body;
    if (!conversationId || !message || !scheduledAt) {
        res.status(400).json({ error: 'conversationId, message and scheduledAt are required' });
        return;
    }
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
        res.status(400).json({ error: 'scheduledAt must be a valid ISO 8601 date' });
        return;
    }
    if (scheduledDate <= new Date()) {
        res.status(400).json({ error: 'scheduledAt must be in the future' });
        return;
    }
    try {
        // Obtém o Chatwoot API token do usuário para o scheduler poder enviar a mensagem depois
        let encryptedApiToken = null;
        try {
            const chatwootToken = await chatwootDatabase_1.default.getUserAccessToken(userId);
            if (chatwootToken) {
                encryptedApiToken = (0, encryption_1.encryptOptional)(chatwootToken);
                logger_1.default.info('API: Got Chatwoot token for scheduled message', { userId, accountId });
            }
            else {
                logger_1.default.warn('API: No Chatwoot token found for user — scheduled message may fail to send', { userId, accountId });
            }
        }
        catch (tokenErr) {
            logger_1.default.warn('API: Failed to retrieve Chatwoot token for scheduled message', { userId, error: tokenErr });
        }
        const scheduledMessage = await database_1.default.scheduledMessage.create({
            data: {
                accountId,
                createdBy: userId,
                conversationId: parseInt(String(conversationId), 10),
                message,
                scheduledAt: scheduledDate,
                status: 'pending',
                apiToken: encryptedApiToken,
            },
        });
        logger_1.default.info('API: Scheduled message created', { messageId: scheduledMessage.id, accountId, hasToken: !!encryptedApiToken });
        res.json({ success: true, data: scheduledMessage });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to create scheduled message', { accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to create scheduled message' });
    }
});
/**
 * @swagger
 * /v1/scheduled-messages/{messageId}:
 *   delete:
 *     summary: Cancela uma mensagem agendada
 *     tags: [Agendamentos]
 *     security:
 *       - BearerAuth: []
 */
router.delete('/scheduled-messages/:messageId', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const messageId = parseInt(req.params.messageId);
    try {
        const message = await database_1.default.scheduledMessage.findFirst({
            where: { id: messageId, accountId, status: 'pending' },
        });
        if (!message) {
            res.status(404).json({ error: 'Scheduled message not found or already sent' });
            return;
        }
        await database_1.default.scheduledMessage.delete({
            where: { id: messageId },
        });
        logger_1.default.info('API: Scheduled message deleted', { messageId, accountId });
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to delete scheduled message', { messageId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to delete scheduled message' });
    }
});
// ==================== CHAT INTERNO ====================
/**
 * @swagger
 * /v1/internal-chats:
 *   get:
 *     summary: Lista chats internos
 *     tags: [Chat Interno]
 *     security:
 *       - BearerAuth: []
 */
router.get('/internal-chats', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    try {
        const chats = await database_1.default.internalChat.findMany({
            where: { accountId },
            include: {
                members: true,
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json({ success: true, data: chats });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to list internal chats', { accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to list internal chats' });
    }
});
/**
 * @swagger
 * /v1/internal-chats/{chatId}/messages:
 *   get:
 *     summary: Lista mensagens de um chat
 *     tags: [Chat Interno]
 *     security:
 *       - BearerAuth: []
 */
router.get('/internal-chats/:chatId/messages', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const chatId = parseInt(req.params.chatId);
    try {
        const chat = await database_1.default.internalChat.findFirst({
            where: { id: chatId, accountId },
        });
        if (!chat) {
            res.status(404).json({ error: 'Chat not found' });
            return;
        }
        const messages = await database_1.default.internalChatMessage.findMany({
            where: { chatId },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, data: messages });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to list chat messages', { chatId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to list chat messages' });
    }
});
/**
 * @swagger
 * /v1/internal-chats/{chatId}/messages:
 *   post:
 *     summary: Envia uma mensagem em um chat
 *     tags: [Chat Interno]
 *     security:
 *       - BearerAuth: []
 */
router.post('/internal-chats/:chatId/messages', async (req, res) => {
    const apiReq = req;
    const accountId = apiReq.apiTokenData.accountId;
    const userId = apiReq.apiTokenData.userId;
    const chatId = parseInt(req.params.chatId);
    const { content } = req.body;
    if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
    }
    try {
        const chat = await database_1.default.internalChat.findFirst({
            where: { id: chatId, accountId },
        });
        if (!chat) {
            res.status(404).json({ error: 'Chat not found' });
            return;
        }
        const message = await database_1.default.internalChatMessage.create({
            data: {
                chatId,
                userId,
                content,
            },
        });
        await database_1.default.internalChat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
        });
        logger_1.default.info('API: Internal chat message sent', { messageId: message.id, chatId, accountId });
        res.json({ success: true, data: message });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API: Failed to send chat message', { chatId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Failed to send chat message' });
    }
});
exports.default = router;
//# sourceMappingURL=public-api.js.map