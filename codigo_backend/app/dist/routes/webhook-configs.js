"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KANBAN_WEBHOOK_EVENTS = void 0;
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
exports.KANBAN_WEBHOOK_EVENTS = [
    { value: 'card.created', label: 'Card Criado', description: 'Quando um card é adicionado ao kanban' },
    { value: 'card.moved', label: 'Card Movido', description: 'Quando um card é movido entre colunas/estágios' },
    { value: 'card.deleted', label: 'Card Removido', description: 'Quando um card é removido do kanban' },
    { value: 'card.updated', label: 'Card Atualizado', description: 'Quando um card é atualizado (assignee, label, etc.)' },
    { value: 'funnel.created', label: 'Funil Criado', description: 'Quando um funil é criado' },
    { value: 'funnel.updated', label: 'Funil Atualizado', description: 'Quando um funil é atualizado' },
    { value: 'stage.created', label: 'Estágio Criado', description: 'Quando um estágio é adicionado a um funil' },
    { value: 'stage.updated', label: 'Estágio Atualizado', description: 'Quando um estágio é atualizado' },
];
// GET /api/webhook-configs/events - Lista eventos disponíveis
router.get('/events', (_req, res) => {
    res.json({ success: true, data: exports.KANBAN_WEBHOOK_EVENTS });
});
// GET /api/webhook-configs - Lista webhooks do account
router.get('/', async (req, res) => {
    const authReq = req;
    try {
        const webhooks = await database_1.default.webhookConfig.findMany({
            where: { accountId: authReq.user.account_id },
            orderBy: { createdAt: 'desc' },
        });
        const parsed = webhooks.map(w => ({ ...w, events: JSON.parse(w.events) }));
        res.json({ success: true, data: parsed });
    }
    catch (error) {
        logger_1.default.error('Failed to list webhook configs', { error });
        res.status(500).json({ error: 'Failed to list webhook configs' });
    }
});
// POST /api/webhook-configs - Cria um webhook
router.post('/', async (req, res) => {
    const authReq = req;
    const { name, url, events, isActive, secret } = req.body;
    if (!name?.trim()) {
        res.status(400).json({ error: 'Nome é obrigatório' });
        return;
    }
    if (!url?.trim()) {
        res.status(400).json({ error: 'URL é obrigatória' });
        return;
    }
    if (!events || !Array.isArray(events) || events.length === 0) {
        res.status(400).json({ error: 'Pelo menos um evento é obrigatório' });
        return;
    }
    try {
        const webhook = await database_1.default.webhookConfig.create({
            data: {
                accountId: authReq.user.account_id,
                name: name.trim(),
                url: url.trim(),
                events: JSON.stringify(events),
                isActive: isActive !== false,
                secret: secret?.trim() || null,
            },
        });
        res.json({ success: true, data: { ...webhook, events: JSON.parse(webhook.events) } });
    }
    catch (error) {
        logger_1.default.error('Failed to create webhook config', { error });
        res.status(500).json({ error: 'Failed to create webhook config' });
    }
});
// PUT /api/webhook-configs/:id - Atualiza um webhook
router.put('/:id', async (req, res) => {
    const authReq = req;
    const id = parseInt(req.params.id);
    const { name, url, events, isActive, secret } = req.body;
    try {
        const existing = await database_1.default.webhookConfig.findFirst({
            where: { id, accountId: authReq.user.account_id },
        });
        if (!existing) {
            res.status(404).json({ error: 'Webhook não encontrado' });
            return;
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (url !== undefined)
            updateData.url = url.trim();
        if (events !== undefined)
            updateData.events = JSON.stringify(events);
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (secret !== undefined)
            updateData.secret = secret?.trim() || null;
        const updated = await database_1.default.webhookConfig.update({ where: { id }, data: updateData });
        res.json({ success: true, data: { ...updated, events: JSON.parse(updated.events) } });
    }
    catch (error) {
        logger_1.default.error('Failed to update webhook config', { error });
        res.status(500).json({ error: 'Failed to update webhook config' });
    }
});
// DELETE /api/webhook-configs/:id - Remove um webhook
router.delete('/:id', async (req, res) => {
    const authReq = req;
    const id = parseInt(req.params.id);
    try {
        const existing = await database_1.default.webhookConfig.findFirst({
            where: { id, accountId: authReq.user.account_id },
        });
        if (!existing) {
            res.status(404).json({ error: 'Webhook não encontrado' });
            return;
        }
        await database_1.default.webhookConfig.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Failed to delete webhook config', { error });
        res.status(500).json({ error: 'Failed to delete webhook config' });
    }
});
// POST /api/webhook-configs/:id/test - Envia payload de teste
router.post('/:id/test', async (req, res) => {
    const authReq = req;
    const id = parseInt(req.params.id);
    try {
        const webhook = await database_1.default.webhookConfig.findFirst({
            where: { id, accountId: authReq.user.account_id },
        });
        if (!webhook) {
            res.status(404).json({ error: 'Webhook não encontrado' });
            return;
        }
        const payload = {
            event: 'test',
            timestamp: new Date().toISOString(),
            accountId: authReq.user.account_id,
            data: {
                message: 'Este é um payload de teste do KanbanCW',
                webhookId: id,
                webhookName: webhook.name,
            },
        };
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'KanbanCW-Webhook/1.0',
            'X-KanbanCW-Event': 'test',
        };
        if (webhook.secret) {
            const hmac = crypto_1.default.createHmac('sha256', webhook.secret);
            hmac.update(JSON.stringify(payload));
            headers['X-KanbanCW-Signature'] = `sha256=${hmac.digest('hex')}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            res.json({ success: true, statusCode: response.status, message: `Webhook disparado com sucesso (HTTP ${response.status})` });
        }
        catch (fetchError) {
            clearTimeout(timeout);
            res.status(400).json({ error: `Falha ao chamar URL: ${fetchError.message}` });
        }
    }
    catch (error) {
        logger_1.default.error('Failed to test webhook', { error });
        res.status(500).json({ error: 'Failed to test webhook' });
    }
});
exports.default = router;
//# sourceMappingURL=webhook-configs.js.map