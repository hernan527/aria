"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const webhookDispatcher_1 = require("../services/webhookDispatcher");
const router = (0, express_1.Router)();
const CHATWOOT_BASE_URL = process.env.CHATWOOT_API_URL || `https://${process.env.CHATWOOT_DOMAIN}`;
// Helper: builds rich webhook payload
async function buildCardWebhookData(accountId, conversationId, jwt, apiToken) {
    const currentCard = await database_1.default.card.findUnique({
        where: { conversationId_accountId: { conversationId, accountId } },
        include: { stage: { include: { funnel: true } } }
    }).catch(() => null);
    let contact = {};
    let conversation = { id: conversationId };
    try {
        const jwtHeaders = jwt['access-token'] ? jwt : undefined;
        const token = jwt['access-token'] ? undefined : apiToken;
        const conv = await chatwoot_1.default.getConversation(accountId, conversationId, jwtHeaders, token);
        if (conv) {
            conversation = {
                id: conversationId,
                status: conv.status,
                inboxId: conv.inbox_id,
                assigneeId: conv.meta?.assignee?.id ?? null,
                assigneeName: conv.meta?.assignee?.name ?? null,
            };
            if (conv.meta?.sender) {
                contact = {
                    id: conv.meta.sender.id,
                    name: conv.meta.sender.name,
                    phone: conv.meta.sender.phone_number ?? null,
                    email: conv.meta.sender.email ?? null,
                };
            }
        }
    }
    catch { /* non-blocking */ }
    const fromColumn = currentCard?.stage ? {
        type: 'stage',
        stageId: currentCard.stage.id,
        stageName: currentCard.stage.name,
        funnelId: currentCard.stage.funnel.id,
        funnelName: currentCard.stage.funnel.name,
    } : null;
    return { contact, conversation, fromColumn, cardData: currentCard };
}
// Middleware: verifica permissão Kanban
async function checkKanbanEnabled(req, res, next) {
    const authReq = req;
    try {
        const permissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId: authReq.user.account_id }
        });
        if (permissions && !permissions.kanbanEnabled) {
            return res.status(403).json({ error: 'Acesso ao Kanban desabilitado para esta empresa.' });
        }
        next();
    }
    catch {
        next(); // fail-open
    }
}
router.use(checkKanbanEnabled);
// GET /api/kanban/stats
router.get('/stats', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    try {
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        const [conversations, inboxList] = await Promise.all([
            chatwoot_1.default.getConversations(accountId, jwtArg, tokenArg, { status: 'all', fetchAll: true }),
            chatwoot_1.default.getInboxes(accountId, jwtArg, tokenArg).catch(() => [])
        ]);
        const byStatus = { open: 0, pending: 0, resolved: 0 };
        const byLeadStatus = { won: 0, lost: 0, open: 0 };
        let totalValue = 0;
        for (const conv of conversations) {
            if (conv.status === 'open')
                byStatus.open++;
            else if (conv.status === 'pending')
                byStatus.pending++;
            else if (conv.status === 'resolved')
                byStatus.resolved++;
            const cardData = await database_1.default.card.findFirst({
                where: { conversationId: conv.id, accountId },
                include: { items: { select: { value: true, quantity: true } } }
            });
            const ls = cardData?.leadStatus || 'open';
            if (ls === 'won')
                byLeadStatus.won++;
            else if (ls === 'lost')
                byLeadStatus.lost++;
            else
                byLeadStatus.open++;
            const convValue = cardData?.items.reduce((s, i) => s + i.value * i.quantity, 0) || 0;
            totalValue += convValue;
        }
        const totalConversations = conversations.length;
        const totalClosed = byLeadStatus.won + byLeadStatus.lost;
        const conversionRate = totalClosed > 0 ? (byLeadStatus.won / totalClosed) * 100 : 0;
        const averageValue = totalConversations > 0 ? totalValue / totalConversations : 0;
        const closedCards = await database_1.default.card.findMany({
            where: { accountId, closedAt: { not: null }, leadStatus: { in: ['won', 'lost'] } },
            select: { createdAt: true, closedAt: true, leadStatus: true, closeReason: true }
        });
        let totalCloseDays = 0;
        const wonReasonMap = new Map();
        const lostReasonMap = new Map();
        for (const c of closedCards) {
            if (c.closedAt) {
                totalCloseDays += (c.closedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            }
            if (c.closeReason) {
                const map = c.leadStatus === 'won' ? wonReasonMap : lostReasonMap;
                map.set(c.closeReason, (map.get(c.closeReason) || 0) + 1);
            }
        }
        const averageCloseTimeDays = closedCards.length > 0
            ? Math.round((totalCloseDays / closedCards.length) * 10) / 10
            : null;
        res.json({
            totalConversations,
            byStatus,
            byLeadStatus,
            totalValue,
            averageValue,
            conversionRate,
            averageCloseTimeDays,
            wonReasons: Array.from(wonReasonMap.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
            lostReasons: Array.from(lostReasonMap.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching kanban stats', { error, accountId });
        res.status(500).json({ error: 'Failed to fetch kanban statistics' });
    }
});
// GET /api/kanban
router.get('/', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    const inboxIdRaw = req.query.inboxId ? parseInt(req.query.inboxId) : NaN;
    const inboxId = !isNaN(inboxIdRaw) && inboxIdRaw > 0 ? inboxIdRaw : undefined;
    try {
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        // Busca funil de sistema ativo ou primeiro funil ativo
        let systemFunnel = await database_1.default.funnel.findFirst({
            where: { accountId, isSystem: true, isActive: true },
            include: { stages: { orderBy: { order: 'asc' } }, allowedUsers: true }
        });
        if (!systemFunnel) {
            systemFunnel = await database_1.default.funnel.findFirst({
                where: { accountId, isActive: true },
                include: { stages: { orderBy: { order: 'asc' } }, allowedUsers: true },
                orderBy: { order: 'asc' }
            });
        }
        if (!systemFunnel) {
            return res.status(404).json({
                error: 'Nenhum funil ativo',
                message: 'Active un embudo en Gestionar Embudos para usar esta vista'
            });
        }
        const [conversations, inboxes] = await Promise.all([
            chatwoot_1.default.getConversations(accountId, jwtArg, tokenArg, { status: 'all', fetchAll: true }),
            chatwoot_1.default.getInboxes(accountId, jwtArg, tokenArg).catch(() => [])
        ]);
        let filteredConversations = inboxId
            ? conversations.filter((c) => c.inbox_id === inboxId)
            : conversations;
        const inboxMap = new Map(inboxes.map((i) => [i.id, i]));
        // Cards em colunas extras (sem chatwootStatus)
        const localCards = await database_1.default.card.findMany({
            where: { accountId, stage: { funnelId: systemFunnel.id, chatwootStatus: null } },
            include: { stage: true }
        });
        const allCards = await database_1.default.card.findMany({
            where: { accountId },
            select: { conversationId: true, customName: true, stageId: true, leadStatus: true, notes: true }
        });
        const conversationIds = filteredConversations.map((c) => c.id);
        const cardItems = await database_1.default.cardItem.findMany({
            where: { accountId, conversationId: { in: conversationIds } },
            orderBy: { order: 'asc' }
        });
        const localCardMap = new Map();
        const customNameMap = new Map();
        const leadStatusMap = new Map();
        const notesMap = new Map();
        const itemsMap = new Map();
        const totalValueMap = new Map();
        for (const c of localCards) {
            if (c.conversationId !== null)
                localCardMap.set(c.conversationId, c.stageId);
        }
        for (const c of allCards) {
            if (c.conversationId !== null) {
                customNameMap.set(c.conversationId, c.customName);
                leadStatusMap.set(c.conversationId, c.leadStatus || 'open');
                notesMap.set(c.conversationId, c.notes || null);
            }
        }
        for (const item of cardItems) {
            const existing = itemsMap.get(item.conversationId) || [];
            existing.push(item);
            itemsMap.set(item.conversationId, existing);
            totalValueMap.set(item.conversationId, (totalValueMap.get(item.conversationId) || 0) + item.value * item.quantity);
        }
        const cardsByStatus = { open: [], pending: [], resolved: [] };
        const cardsByStage = {};
        for (const stage of systemFunnel.stages) {
            if (!stage.chatwootStatus)
                cardsByStage[stage.id] = [];
        }
        for (const conv of filteredConversations) {
            const card = {
                id: conv.id,
                status: conv.status,
                priority: conv.priority,
                unread_count: conv.unread_count,
                created_at: new Date(Number(conv.created_at) * 1000).toISOString(),
                updated_at: new Date(Number(conv.updated_at) * 1000).toISOString(),
                contact: conv.meta?.sender || null,
                meta: { assignee: conv.meta?.assignee || null },
                inbox: inboxMap.get(conv.inbox_id) || null,
                labels: conv.labels || [],
                customName: customNameMap.get(conv.id) || null,
                leadStatus: leadStatusMap.get(conv.id),
                items: itemsMap.get(conv.id) || [],
                totalValue: totalValueMap.get(conv.id) || 0,
                notes: notesMap.get(conv.id) || null,
                chatwootUrl: `${CHATWOOT_BASE_URL}/app/accounts/${accountId}/conversations/${conv.id}`,
            };
            const localStageId = localCardMap.get(conv.id);
            if (localStageId && cardsByStage[localStageId] !== undefined) {
                cardsByStage[localStageId].push(card);
            }
            else if (cardsByStatus[conv.status]) {
                cardsByStatus[conv.status].push(card);
            }
        }
        const sortCards = (cards) => cards.sort((a, b) => {
            if (b.unread_count !== a.unread_count)
                return b.unread_count - a.unread_count;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        const LIMIT = 20;
        const columns = systemFunnel.stages.map(stage => {
            if (stage.chatwootStatus) {
                const cards = sortCards(cardsByStatus[stage.chatwootStatus] || []);
                return { id: stage.chatwootStatus, name: stage.name, color: stage.color, chatwootStatus: stage.chatwootStatus, cards, totalCards: cards.length, hasMore: false };
            }
            else {
                const cards = sortCards(cardsByStage[stage.id] || []);
                return { id: String(stage.id), name: stage.name, color: stage.color, chatwootStatus: null, cards: cards.slice(0, LIMIT), totalCards: cards.length, hasMore: cards.length > LIMIT };
            }
        });
        res.json({ success: true, data: { columns } });
    }
    catch (error) {
        logger_1.default.error('Error loading kanban', { error });
        res.status(500).json({ error: 'Failed to load kanban board' });
    }
});
// GET /api/kanban/funnel/:funnelId
router.get('/funnel/:funnelId', async (req, res) => {
    const authReq = req;
    const funnelId = parseInt(req.params.funnelId);
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    const inboxIdRaw = req.query.inboxId ? parseInt(req.query.inboxId) : NaN;
    const inboxId = !isNaN(inboxIdRaw) && inboxIdRaw > 0 ? inboxIdRaw : undefined;
    if (isNaN(funnelId) || funnelId <= 0)
        return res.status(400).json({ error: 'Invalid funnel ID' });
    try {
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId },
            include: { stages: { orderBy: { order: 'asc' }, include: { cards: { orderBy: { order: 'asc' } } } } }
        });
        if (!funnel)
            return res.status(404).json({ error: 'Funnel not found' });
        const [conversations, inboxes] = await Promise.all([
            chatwoot_1.default.getConversations(accountId, jwtArg, tokenArg, { status: 'all', fetchAll: true }),
            chatwoot_1.default.getInboxes(accountId, jwtArg, tokenArg).catch(() => [])
        ]);
        let filteredConversations = inboxId
            ? conversations.filter((c) => c.inbox_id === inboxId)
            : conversations;
        const conversationsMap = new Map(filteredConversations.map((c) => [c.id, c]));
        const inboxMap = new Map(inboxes.map((i) => [i.id, i]));
        const allConversationIds = funnel.stages
            .flatMap(s => s.cards.map(c => c.conversationId))
            .filter((id) => id !== null);
        const cardItems = await database_1.default.cardItem.findMany({
            where: { accountId, conversationId: { in: allConversationIds } },
            orderBy: { order: 'asc' }
        });
        const itemsMap = new Map();
        const totalValueMap = new Map();
        for (const item of cardItems) {
            const existing = itemsMap.get(item.conversationId) || [];
            existing.push(item);
            itemsMap.set(item.conversationId, existing);
            totalValueMap.set(item.conversationId, (totalValueMap.get(item.conversationId) || 0) + item.value * item.quantity);
        }
        const columns = funnel.stages.map(stage => {
            const cards = [];
            for (const card of stage.cards) {
                let transferredFrom = null;
                if (card.transferredFrom) {
                    try {
                        transferredFrom = JSON.parse(card.transferredFrom);
                    }
                    catch { /* ignore */ }
                }
                if (card.conversationId === null) {
                    if (inboxId)
                        continue;
                    cards.push({
                        id: card.id,
                        status: 'standalone',
                        priority: null,
                        unread_count: 0,
                        created_at: card.createdAt.toISOString(),
                        updated_at: card.updatedAt.toISOString(),
                        contact: null,
                        meta: { assignee: null },
                        inbox: null,
                        labels: [],
                        customName: card.customName || 'Card avulso',
                        leadStatus: card.leadStatus,
                        transferredFrom,
                        isStandalone: true,
                        cardId: card.id,
                        items: [],
                        notes: card.notes || null,
                        totalValue: 0
                    });
                    continue;
                }
                const conv = conversationsMap.get(card.conversationId);
                if (conv) {
                    cards.push({
                        id: conv.id,
                        status: conv.status,
                        priority: conv.priority,
                        unread_count: conv.unread_count,
                        created_at: new Date(Number(conv.created_at) * 1000).toISOString(),
                        updated_at: new Date(Number(conv.updated_at) * 1000).toISOString(),
                        contact: conv.meta?.sender || null,
                        meta: { assignee: conv.meta?.assignee || null },
                        inbox: inboxMap.get(conv.inbox_id) || null,
                        labels: conv.labels || [],
                        customName: card.customName || null,
                        leadStatus: card.leadStatus,
                        transferredFrom,
                        items: itemsMap.get(conv.id) || [],
                        totalValue: totalValueMap.get(conv.id) || 0,
                        notes: card.notes || null,
                        chatwootUrl: `${CHATWOOT_BASE_URL}/app/accounts/${accountId}/conversations/${conv.id}`,
                    });
                }
                else {
                    cards.push({
                        id: card.conversationId,
                        status: 'deleted',
                        priority: null,
                        unread_count: 0,
                        created_at: card.createdAt.toISOString(),
                        updated_at: card.updatedAt.toISOString(),
                        contact: null,
                        meta: { assignee: null },
                        inbox: null,
                        labels: [],
                        customName: card.customName || null,
                        leadStatus: card.leadStatus,
                        transferredFrom,
                        items: [],
                        notes: card.notes || null,
                        totalValue: 0
                    });
                }
            }
            cards.sort((a, b) => {
                if (b.unread_count !== a.unread_count)
                    return b.unread_count - a.unread_count;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
            return { id: String(stage.id), name: stage.name, color: stage.color, cards, totalCards: cards.length, hasMore: false };
        });
        res.json({ success: true, data: { columns } });
    }
    catch (error) {
        logger_1.default.error('Error loading funnel board', { error });
        res.status(500).json({ error: 'Failed to load funnel board' });
    }
});
// PATCH /api/kanban/:id/move
router.patch('/:id/move', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { targetColumn } = req.body;
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    if (isNaN(conversationId) || conversationId <= 0)
        return res.status(400).json({ error: 'Invalid conversation ID' });
    if (!targetColumn)
        return res.status(400).json({ error: 'Invalid target column' });
    try {
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        const webhookBase = await buildCardWebhookData(accountId, conversationId, jwt, apiToken);
        if (['open', 'pending', 'resolved'].includes(targetColumn)) {
            const success = await chatwoot_1.default.updateConversationStatus(accountId, conversationId, targetColumn, jwtArg, tokenArg);
            if (!success)
                return res.status(500).json({ error: 'Failed to update conversation status' });
            await database_1.default.card.deleteMany({ where: { conversationId, accountId } });
            (0, webhookDispatcher_1.dispatchWebhook)(accountId, 'card.moved', {
                ...webhookBase,
                movedBy: { id: authReq.user.id },
                movedAt: new Date().toISOString(),
                from: webhookBase.fromColumn ?? { type: 'status', status: webhookBase.conversation.status },
                to: { type: 'status', status: targetColumn },
            }).catch(() => { });
            return res.json({ success: true, conversationId, newStatus: targetColumn });
        }
        const stageId = parseInt(targetColumn);
        if (isNaN(stageId))
            return res.status(400).json({ error: 'Invalid target column' });
        const stage = await database_1.default.stage.findFirst({
            where: { id: stageId, funnel: { accountId } },
            include: { funnel: true }
        });
        if (!stage)
            return res.status(400).json({ error: 'Coluna não encontrada' });
        let finalStage = stage;
        let transferredFrom = null;
        // Auto-transfer automation
        if (stage.automations) {
            try {
                const auto = JSON.parse(stage.automations);
                if (auto.transferTo?.stageId) {
                    const dest = await database_1.default.stage.findFirst({ where: { id: auto.transferTo.stageId }, include: { funnel: true } });
                    if (dest && dest.funnel.accountId === accountId) {
                        transferredFrom = { funnelId: stage.funnel.id, funnelName: stage.funnel.name, stageId: stage.id, stageName: stage.name, transferredAt: new Date().toISOString() };
                        finalStage = dest;
                    }
                }
            }
            catch { /* ignore */ }
        }
        if (finalStage.chatwootStatus) {
            const success = await chatwoot_1.default.updateConversationStatus(accountId, conversationId, finalStage.chatwootStatus, jwtArg, tokenArg);
            if (!success)
                return res.status(500).json({ error: 'Failed to update conversation status' });
            await database_1.default.card.deleteMany({ where: { conversationId, accountId } });
            // Resolve auto-message variables and return for confirmation instead of auto-sending
            let pendingMessage = null;
            if (finalStage.automations) {
                try {
                    const auto = JSON.parse(finalStage.automations);
                    if (auto.autoMessage?.enabled && auto.autoMessage?.text) {
                        pendingMessage = auto.autoMessage.text
                            .replace(/\{name\}/g, webhookBase.contact?.name ?? '')
                            .replace(/\{stage\}/g, finalStage.name ?? '');
                    }
                }
                catch { /* ignore */ }
            }
            return res.json({ success: true, conversationId, newStatus: finalStage.chatwootStatus, transferredFrom, pendingMessage });
        }
        await database_1.default.card.upsert({
            where: { conversationId_accountId: { conversationId, accountId } },
            create: { conversationId, accountId, stageId: finalStage.id, order: 0, transferredFrom: transferredFrom ? JSON.stringify(transferredFrom) : null },
            update: { stageId: finalStage.id, updatedAt: new Date(), transferredFrom: transferredFrom ? JSON.stringify(transferredFrom) : undefined }
        });
        // Resolve auto-message variables and return for confirmation instead of auto-sending
        let pendingMessage = null;
        if (finalStage.automations) {
            try {
                const auto = JSON.parse(finalStage.automations);
                if (auto.autoMessage?.enabled && auto.autoMessage?.text) {
                    pendingMessage = auto.autoMessage.text
                        .replace(/\{name\}/g, webhookBase.contact?.name ?? '')
                        .replace(/\{stage\}/g, finalStage.name ?? '');
                }
            }
            catch { /* ignore */ }
        }
        (0, webhookDispatcher_1.dispatchWebhook)(accountId, 'card.moved', {
            ...webhookBase,
            movedBy: { id: authReq.user.id },
            movedAt: new Date().toISOString(),
            from: webhookBase.fromColumn ?? { type: 'status', status: webhookBase.conversation.status },
            to: { type: 'stage', stageId: finalStage.id, stageName: finalStage.name, funnelId: finalStage.funnel.id, funnelName: finalStage.funnel.name },
        }).catch(() => { });
        res.json({ success: true, conversationId, stageId: finalStage.id, stageName: finalStage.name, transferredFrom, pendingMessage });
    }
    catch (error) {
        logger_1.default.error('Error moving card', { conversationId, error });
        res.status(500).json({ error: 'Failed to move card' });
    }
});
// GET /api/kanban/conversation/:id/stage
router.get('/conversation/:id/stage', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const accountId = authReq.user.account_id;
    if (isNaN(conversationId) || conversationId <= 0)
        return res.status(400).json({ error: 'Invalid conversation ID' });
    try {
        const card = await database_1.default.card.findUnique({
            where: { conversationId_accountId: { conversationId, accountId } },
            include: { stage: { include: { funnel: true } } }
        });
        if (!card)
            return res.json({ success: true, data: null, message: 'Conversa não está associada a nenhum funil' });
        res.json({
            success: true,
            data: {
                cardId: card.id,
                stageId: card.stage.id,
                stageName: card.stage.name,
                stageColor: card.stage.color,
                funnelId: card.stage.funnel.id,
                funnelName: card.stage.funnel.name,
                funnelColor: card.stage.funnel.color
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error getting conversation stage', { conversationId, error });
        res.status(500).json({ error: 'Failed to get conversation stage' });
    }
});
// DELETE /api/kanban/:id/remove
router.delete('/:id/remove', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const accountId = authReq.user.account_id;
    if (isNaN(conversationId) || conversationId <= 0)
        return res.status(400).json({ error: 'Invalid conversation ID' });
    try {
        const webhookBase = await buildCardWebhookData(accountId, conversationId, authReq.jwt, authReq.apiToken);
        await database_1.default.card.delete({ where: { conversationId_accountId: { conversationId, accountId } } });
        (0, webhookDispatcher_1.dispatchWebhook)(accountId, 'card.deleted', {
            ...webhookBase,
            removedBy: { id: authReq.user.id },
            removedAt: new Date().toISOString(),
            stage: webhookBase.fromColumn,
        }).catch(() => { });
        res.json({ success: true, message: 'Conversa removida do funil' });
    }
    catch (error) {
        if (error?.message?.includes('Record to delete does not exist')) {
            return res.json({ success: true, message: 'Conversa não estava em nenhum funil' });
        }
        logger_1.default.error('Error removing card', { conversationId, error });
        res.status(500).json({ error: 'Failed to remove card' });
    }
});
// PATCH /api/kanban/:id/move-to-stage
router.patch('/:id/move-to-stage', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { stageId } = req.body;
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    if (isNaN(conversationId) || conversationId <= 0)
        return res.status(400).json({ error: 'Invalid conversation ID' });
    if (!stageId)
        return res.status(400).json({ error: 'stageId is required' });
    try {
        const targetStageId = parseInt(stageId);
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        const webhookBase = await buildCardWebhookData(accountId, conversationId, jwt, apiToken);
        const stage = await database_1.default.stage.findFirst({ where: { id: targetStageId }, include: { funnel: true } });
        if (!stage || stage.funnel.accountId !== accountId)
            return res.status(404).json({ error: 'Stage not found' });
        let finalStageId = targetStageId;
        const card = await database_1.default.card.upsert({
            where: { conversationId_accountId: { conversationId, accountId } },
            update: { stageId: finalStageId, updatedAt: new Date() },
            create: { conversationId, stageId: finalStageId, accountId, order: 0 }
        });
        // Auto-message
        if (stage.automations) {
            try {
                const auto = JSON.parse(stage.automations);
                if (auto.autoMessage?.enabled && auto.autoMessage?.text) {
                    const msgText = auto.autoMessage.text
                        .replace(/\{name\}/g, webhookBase.contact?.name ?? '')
                        .replace(/\{stage\}/g, stage.name ?? '');
                    await chatwoot_1.default.sendMessage(accountId, conversationId, msgText, jwtArg, tokenArg, auto.autoMessage.attachmentUrl);
                }
            }
            catch { /* ignore */ }
        }
        (0, webhookDispatcher_1.dispatchWebhook)(accountId, 'card.moved', {
            ...webhookBase,
            movedBy: { id: authReq.user.id },
            movedAt: new Date().toISOString(),
            from: webhookBase.fromColumn ?? { type: 'status', status: webhookBase.conversation.status },
            to: { type: 'stage', stageId: finalStageId, stageName: stage.name, funnelId: stage.funnel.id, funnelName: stage.funnel.name },
        }).catch(() => { });
        res.json({ success: true, conversationId, stageId: finalStageId, card });
    }
    catch (error) {
        logger_1.default.error('Error moving card to stage', { conversationId, error });
        res.status(500).json({ error: 'Failed to move card to stage' });
    }
});
// PATCH /api/kanban/:id/update-name
router.patch('/:id/update-name', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { customName } = req.body;
    const accountId = authReq.user.account_id;
    if (customName === undefined)
        return res.status(400).json({ error: 'customName is required' });
    try {
        let existingCard = await database_1.default.card.findFirst({ where: { conversationId, accountId } });
        if (!existingCard) {
            return res.status(404).json({ error: 'Card not found. Associate conversation with a funnel first.' });
        }
        const updated = await database_1.default.card.update({
            where: { id: existingCard.id },
            data: { customName: customName.trim() || null }
        });
        res.json({ success: true, customName: updated.customName });
    }
    catch (error) {
        logger_1.default.error('Error updating card name', { conversationId, error });
        res.status(500).json({ error: 'Failed to update card name' });
    }
});
// PATCH /api/kanban/:id/lead-status
router.patch('/:id/lead-status', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { leadStatus, reason } = req.body;
    const accountId = authReq.user.account_id;
    if (!leadStatus || !['open', 'won', 'lost'].includes(leadStatus)) {
        return res.status(400).json({ error: 'leadStatus deve ser "open", "won" ou "lost"' });
    }
    try {
        const card = await database_1.default.card.findFirst({ where: { conversationId, accountId } });
        if (!card)
            return res.status(404).json({ error: 'Card não encontrado' });
        const updateData = { leadStatus };
        if (leadStatus === 'won' || leadStatus === 'lost') {
            updateData.closedAt = new Date();
            updateData.closeReason = reason || null;
        }
        else {
            updateData.closedAt = null;
            updateData.closeReason = null;
        }
        const updated = await database_1.default.card.update({ where: { id: card.id }, data: updateData });
        res.json({ success: true, leadStatus: updated.leadStatus, closeReason: updated.closeReason });
    }
    catch (error) {
        logger_1.default.error('Error updating lead status', { conversationId, error });
        res.status(500).json({ error: 'Failed to update lead status' });
    }
});
// POST /api/kanban/:id/send-message - Envía un mensaje confirmado por el usuario
router.post('/:id/send-message', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { message } = req.body;
    const accountId = authReq.user.account_id;
    const jwt = authReq.jwt;
    const apiToken = authReq.apiToken;
    if (!message?.trim())
        return res.status(400).json({ error: 'Message is required' });
    try {
        const jwtArg = jwt['access-token'] ? jwt : undefined;
        const tokenArg = jwt['access-token'] ? undefined : apiToken;
        const sent = await chatwoot_1.default.sendMessage(accountId, conversationId, message.trim(), jwtArg, tokenArg);
        if (!sent)
            return res.status(500).json({ error: 'Failed to send message' });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Error sending message', { conversationId, error });
        res.status(500).json({ error: 'Failed to send message' });
    }
});
// PATCH /api/kanban/:id/notes
router.patch('/:id/notes', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { notes } = req.body;
    const accountId = authReq.user.account_id;
    if (isNaN(conversationId) || conversationId <= 0)
        return res.status(400).json({ error: 'Invalid conversation ID' });
    if (notes === undefined)
        return res.status(400).json({ error: 'notes is required' });
    try {
        const card = await database_1.default.card.findFirst({ where: { conversationId, accountId } });
        if (!card)
            return res.status(404).json({ error: 'Card not found. Move card to a funnel stage first.' });
        const updated = await database_1.default.card.update({
            where: { id: card.id },
            data: { notes: notes.trim() || null }
        });
        res.json({ success: true, notes: updated.notes });
    }
    catch (error) {
        logger_1.default.error('Error updating notes', { conversationId, error });
        res.status(500).json({ error: 'Failed to update notes' });
    }
});
exports.default = router;
//# sourceMappingURL=kanban.js.map