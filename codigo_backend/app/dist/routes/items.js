"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// ============================================
// ITEM TEMPLATES (Templates por Funil)
// ============================================
/**
 * GET /api/funnels/:funnelId/item-templates
 * Lista todos os templates de itens de um funil
 */
router.get('/funnels/:funnelId/item-templates', async (req, res) => {
    const authReq = req;
    try {
        const { funnelId } = req.params;
        const accountId = authReq.user.account_id;
        // Verificar se o funil pertence à conta do usuário
        const funnel = await database_1.default.funnel.findFirst({
            where: {
                id: parseInt(funnelId),
                accountId
            }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funil não encontrado' });
        }
        const templates = await database_1.default.itemTemplate.findMany({
            where: {
                funnelId: parseInt(funnelId),
                accountId
            },
            orderBy: [
                { order: 'asc' },
                { createdAt: 'asc' }
            ]
        });
        res.json(templates);
    }
    catch (error) {
        console.error('Erro ao buscar templates:', error);
        res.status(500).json({ error: 'Erro ao buscar templates' });
    }
});
/**
 * POST /api/funnels/:funnelId/item-templates
 * Cria um novo template de item
 */
router.post('/funnels/:funnelId/item-templates', async (req, res) => {
    const authReq = req;
    try {
        const { funnelId } = req.params;
        const accountId = authReq.user.account_id;
        const { title, description, value, order } = req.body;
        // Validações
        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: 'Título deve ter pelo menos 3 caracteres' });
        }
        const valueInt = parseInt(value) || 0;
        if (valueInt < 0) {
            return res.status(400).json({ error: 'Valor não pode ser negativo' });
        }
        // Verificar se o funil pertence à conta do usuário
        const funnel = await database_1.default.funnel.findFirst({
            where: {
                id: parseInt(funnelId),
                accountId
            }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funil não encontrado' });
        }
        const template = await database_1.default.itemTemplate.create({
            data: {
                funnelId: parseInt(funnelId),
                accountId,
                title: title.trim(),
                description: description?.trim() || null,
                value: valueInt,
                order: order || 0
            }
        });
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Erro ao criar template:', error);
        res.status(500).json({ error: 'Erro ao criar template' });
    }
});
/**
 * PUT /api/funnels/:funnelId/item-templates/:id
 * Atualiza um template de item
 */
router.put('/funnels/:funnelId/item-templates/:id', async (req, res) => {
    const authReq = req;
    try {
        const { funnelId, id } = req.params;
        const accountId = authReq.user.account_id;
        const { title, description, value, order } = req.body;
        // Validações
        if (title && title.trim().length < 3) {
            return res.status(400).json({ error: 'Título deve ter pelo menos 3 caracteres' });
        }
        if (value !== undefined) {
            const valueInt = parseInt(value);
            if (isNaN(valueInt) || valueInt < 0) {
                return res.status(400).json({ error: 'Valor inválido' });
            }
        }
        // Verificar se o template existe e pertence ao funil e conta corretos
        const existingTemplate = await database_1.default.itemTemplate.findFirst({
            where: {
                id: parseInt(id),
                funnelId: parseInt(funnelId),
                accountId
            }
        });
        if (!existingTemplate) {
            return res.status(404).json({ error: 'Template não encontrado' });
        }
        const updateData = {};
        if (title !== undefined)
            updateData.title = title.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        if (value !== undefined)
            updateData.value = parseInt(value);
        if (order !== undefined)
            updateData.order = order;
        const template = await database_1.default.itemTemplate.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(template);
    }
    catch (error) {
        console.error('Erro ao atualizar template:', error);
        res.status(500).json({ error: 'Erro ao atualizar template' });
    }
});
/**
 * DELETE /api/funnels/:funnelId/item-templates/:id
 * Deleta um template de item
 */
router.delete('/funnels/:funnelId/item-templates/:id', async (req, res) => {
    const authReq = req;
    try {
        const { funnelId, id } = req.params;
        const accountId = authReq.user.account_id;
        // Verificar se o template existe e pertence ao funil e conta corretos
        const existingTemplate = await database_1.default.itemTemplate.findFirst({
            where: {
                id: parseInt(id),
                funnelId: parseInt(funnelId),
                accountId
            }
        });
        if (!existingTemplate) {
            return res.status(404).json({ error: 'Template não encontrado' });
        }
        await database_1.default.itemTemplate.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Template deletado com sucesso' });
    }
    catch (error) {
        console.error('Erro ao deletar template:', error);
        res.status(500).json({ error: 'Erro ao deletar template' });
    }
});
// ============================================
// CARD ITEMS (Itens vinculados a Cards)
// ============================================
/**
 * GET /api/conversations/:conversationId/items
 * Lista todos os itens de uma conversa (card)
 */
router.get('/conversations/:conversationId/items', async (req, res) => {
    const authReq = req;
    try {
        const { conversationId } = req.params;
        const accountId = authReq.user.account_id;
        // Buscar o card da conversa
        const card = await database_1.default.card.findFirst({
            where: {
                conversationId: parseInt(conversationId),
                accountId
            }
        });
        // Se o card não existe (conversa órfã), retorna array vazio em vez de 404
        if (!card) {
            logger_1.default.warn('Card not found for conversation', { conversationId, accountId });
            return res.json([]);
        }
        const items = await database_1.default.cardItem.findMany({
            where: {
                cardId: card.id,
                conversationId: parseInt(conversationId),
                accountId
            },
            include: {
                template: true
            },
            orderBy: [
                { order: 'asc' },
                { createdAt: 'asc' }
            ]
        });
        res.json(items);
    }
    catch (error) {
        console.error('Erro ao buscar itens:', error);
        res.status(500).json({ error: 'Erro ao buscar itens' });
    }
});
/**
 * POST /api/conversations/:conversationId/items
 * Cria um novo item para uma conversa
 * Body pode incluir templateId (copia do template) ou title/description/value (manual)
 */
router.post('/conversations/:conversationId/items', async (req, res) => {
    const authReq = req;
    try {
        const { conversationId } = req.params;
        const accountId = authReq.user.account_id;
        const { templateId, title, description, value, quantity, order } = req.body;
        // Buscar o card da conversa
        const card = await database_1.default.card.findFirst({
            where: {
                conversationId: parseInt(conversationId),
                accountId
            }
        });
        // Se o card não existe (conversa órfã), retorna array vazio em vez de 404
        if (!card) {
            logger_1.default.warn('Card not found for conversation', { conversationId, accountId });
            return res.json([]);
        }
        let itemData = {
            cardId: card.id,
            conversationId: parseInt(conversationId),
            accountId,
            quantity: quantity || 1,
            order: order || 0
        };
        // Se templateId fornecido, copiar dados do template
        if (templateId) {
            const template = await database_1.default.itemTemplate.findFirst({
                where: {
                    id: parseInt(templateId),
                    accountId
                }
            });
            if (!template) {
                return res.status(404).json({ error: 'Template não encontrado' });
            }
            itemData.templateId = template.id;
            itemData.title = template.title;
            itemData.description = template.description;
            itemData.value = template.value;
        }
        else {
            // Item manual - validar campos obrigatórios
            if (!title || title.trim().length < 3) {
                return res.status(400).json({ error: 'Título deve ter pelo menos 3 caracteres' });
            }
            const valueInt = parseInt(value) || 0;
            if (valueInt < 0) {
                return res.status(400).json({ error: 'Valor não pode ser negativo' });
            }
            itemData.title = title.trim();
            itemData.description = description?.trim() || null;
            itemData.value = valueInt;
        }
        // Validar quantidade
        const quantityInt = parseInt(itemData.quantity);
        if (isNaN(quantityInt) || quantityInt < 1) {
            return res.status(400).json({ error: 'Quantidade deve ser pelo menos 1' });
        }
        const item = await database_1.default.cardItem.create({
            data: itemData,
            include: {
                template: true
            }
        });
        res.status(201).json(item);
    }
    catch (error) {
        console.error('Erro ao criar item:', error);
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});
/**
 * PUT /api/conversations/:conversationId/items/:id
 * Atualiza um item
 */
router.put('/conversations/:conversationId/items/:id', async (req, res) => {
    const authReq = req;
    try {
        const { conversationId, id } = req.params;
        const accountId = authReq.user.account_id;
        const { title, description, value, quantity, order } = req.body;
        // Verificar se o item existe e pertence à conversa e conta corretos
        const existingItem = await database_1.default.cardItem.findFirst({
            where: {
                id: parseInt(id),
                conversationId: parseInt(conversationId),
                accountId
            }
        });
        if (!existingItem) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        // Validações
        if (title !== undefined && title.trim().length < 3) {
            return res.status(400).json({ error: 'Título deve ter pelo menos 3 caracteres' });
        }
        if (value !== undefined) {
            const valueInt = parseInt(value);
            if (isNaN(valueInt) || valueInt < 0) {
                return res.status(400).json({ error: 'Valor inválido' });
            }
        }
        if (quantity !== undefined) {
            const quantityInt = parseInt(quantity);
            if (isNaN(quantityInt) || quantityInt < 1) {
                return res.status(400).json({ error: 'Quantidade deve ser pelo menos 1' });
            }
        }
        const updateData = {};
        if (title !== undefined)
            updateData.title = title.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        if (value !== undefined)
            updateData.value = parseInt(value);
        if (quantity !== undefined)
            updateData.quantity = parseInt(quantity);
        if (order !== undefined)
            updateData.order = order;
        const item = await database_1.default.cardItem.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                template: true
            }
        });
        res.json(item);
    }
    catch (error) {
        console.error('Erro ao atualizar item:', error);
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});
/**
 * DELETE /api/conversations/:conversationId/items/:id
 * Deleta um item
 */
router.delete('/conversations/:conversationId/items/:id', async (req, res) => {
    const authReq = req;
    try {
        const { conversationId, id } = req.params;
        const accountId = authReq.user.account_id;
        // Verificar se o item existe e pertence à conversa e conta corretos
        const existingItem = await database_1.default.cardItem.findFirst({
            where: {
                id: parseInt(id),
                conversationId: parseInt(conversationId),
                accountId
            }
        });
        if (!existingItem) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }
        await database_1.default.cardItem.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Item deletado com sucesso' });
    }
    catch (error) {
        console.error('Erro ao deletar item:', error);
        res.status(500).json({ error: 'Erro ao deletar item' });
    }
});
/**
 * GET /api/conversations/:conversationId/items/total
 * Calcula o total de todos os itens de uma conversa
 */
router.get('/conversations/:conversationId/items/total', async (req, res) => {
    const authReq = req;
    try {
        const { conversationId } = req.params;
        const accountId = authReq.user.account_id;
        // Buscar o card da conversa
        const card = await database_1.default.card.findFirst({
            where: {
                conversationId: parseInt(conversationId),
                accountId
            }
        });
        // Se o card não existe (conversa órfã), retorna array vazio em vez de 404
        if (!card) {
            logger_1.default.warn('Card not found for conversation', { conversationId, accountId });
            return res.json([]);
        }
        const items = await database_1.default.cardItem.findMany({
            where: {
                cardId: card.id,
                conversationId: parseInt(conversationId),
                accountId
            },
            select: {
                value: true,
                quantity: true
            }
        });
        const total = items.reduce((sum, item) => sum + (item.value * item.quantity), 0);
        res.json({ total, itemCount: items.length });
    }
    catch (error) {
        console.error('Erro ao calcular total:', error);
        res.status(500).json({ error: 'Erro ao calcular total' });
    }
});
exports.default = router;
//# sourceMappingURL=items.js.map