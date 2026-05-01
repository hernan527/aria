"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
/**
 * GET /api/funnels/:funnelId/custom-fields
 * Lista campos personalizados de um funil
 */
router.get('/funnels/:funnelId/custom-fields', async (req, res) => {
    try {
        const accountId = req.accountId;
        const funnelId = parseInt(req.params.funnelId);
        if (isNaN(funnelId)) {
            return res.status(400).json({ success: false, error: 'Invalid funnel ID' });
        }
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId },
            include: {
                customFields: {
                    where: { isActive: true },
                    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
                }
            }
        });
        if (!funnel) {
            return res.status(404).json({ success: false, error: 'Funnel not found' });
        }
        res.json({ success: true, data: funnel.customFields.map(f => ({
                ...f,
                options: f.options ? JSON.parse(f.options) : null
            })) });
    }
    catch (error) {
        logger_1.default.error('Error fetching custom fields', { error });
        res.status(500).json({ success: false, error: 'Failed to fetch custom fields' });
    }
});
/**
 * POST /api/funnels/:funnelId/custom-fields
 * Cria campo personalizado
 */
router.post('/funnels/:funnelId/custom-fields', async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const funnelId = parseInt(req.params.funnelId);
        const { name, fieldType, options, required } = req.body;
        if (isNaN(funnelId) || !name || !fieldType) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }
        const funnel = await database_1.default.funnel.findFirst({ where: { id: funnelId, accountId } });
        if (!funnel)
            return res.status(404).json({ success: false, error: 'Funnel not found' });
        const field = await database_1.default.customField.create({
            data: {
                funnelId,
                name: name.trim(),
                fieldType,
                options: options ? JSON.stringify(options) : null,
                required: required || false,
                order: 0,
                createdBy: userId
            }
        });
        res.json({ success: true, data: { ...field, options: field.options ? JSON.parse(field.options) : null } });
    }
    catch (error) {
        logger_1.default.error('Error creating custom field', { error });
        res.status(500).json({ success: false, error: 'Failed to create custom field' });
    }
});
/**
 * DELETE /api/funnels/:funnelId/custom-fields/:id
 */
router.delete('/funnels/:funnelId/custom-fields/:id', async (req, res) => {
    try {
        const accountId = req.accountId;
        const funnelId = parseInt(req.params.funnelId);
        const fieldId = parseInt(req.params.id);
        const funnel = await database_1.default.funnel.findFirst({ where: { id: funnelId, accountId } });
        if (!funnel)
            return res.status(404).json({ success: false, error: 'Funnel not found' });
        await database_1.default.customField.update({ where: { id: fieldId }, data: { isActive: false } });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Error deleting custom field', { error });
        res.status(500).json({ success: false, error: 'Failed to delete' });
    }
});
/**
 * GET /api/cards/:conversationId/custom-fields
 */
router.get('/cards/:conversationId/custom-fields', async (req, res) => {
    try {
        const accountId = req.accountId;
        const conversationId = parseInt(req.params.conversationId);
        const card = await database_1.default.card.findFirst({
            where: { conversationId, accountId },
            include: { stage: true }
        });
        // Se o card não existe (conversa órfã), retorna array vazio em vez de 404
        if (!card) {
            logger_1.default.warn('Card not found for conversation', { conversationId, accountId });
            return res.json({ success: true, data: [] });
        }
        const stage = await database_1.default.stage.findUnique({
            where: { id: card.stageId },
            include: {
                funnel: {
                    include: {
                        customFields: { where: { isActive: true }, orderBy: { order: 'asc' } }
                    }
                }
            }
        });
        const values = await database_1.default.customFieldValue.findMany({
            where: { cardId: card.id }
        });
        const fieldsWithValues = stage?.funnel.customFields.map(field => ({
            fieldId: field.id,
            value: values.find(v => v.fieldId === field.id)?.value || null,
            field: { ...field, options: field.options ? JSON.parse(field.options) : null }
        })) || [];
        res.json({ success: true, data: fieldsWithValues });
    }
    catch (error) {
        logger_1.default.error('Error fetching card fields', { error });
        res.status(500).json({ success: false, error: 'Failed to fetch' });
    }
});
/**
 * PUT /api/cards/:conversationId/custom-fields/:fieldId
 */
router.put('/cards/:conversationId/custom-fields/:fieldId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const conversationId = parseInt(req.params.conversationId);
        const fieldId = parseInt(req.params.fieldId);
        const { value } = req.body;
        const card = await database_1.default.card.findFirst({ where: { conversationId, accountId } });
        if (!card)
            return res.status(404).json({ success: false, error: 'Card not found' });
        const fieldValue = await database_1.default.customFieldValue.upsert({
            where: { cardId_fieldId: { cardId: card.id, fieldId } },
            create: { cardId: card.id, fieldId, conversationId, accountId, value },
            update: { value }
        });
        res.json({ success: true, data: fieldValue });
    }
    catch (error) {
        logger_1.default.error('Error saving field value', { error });
        res.status(500).json({ success: false, error: 'Failed to save' });
    }
});
exports.default = router;
//# sourceMappingURL=customFields.js.map