"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// GET /api/cwapp/contacts — lista paginada ou busca
router.get('/', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const { q = '', page = '1' } = req.query;
    const pageNum = parseInt(page) || 1;
    try {
        let raw = [];
        let totalCount;
        if (q.trim()) {
            raw = await chatwoot_1.default.searchContacts(accountId, q.trim(), authReq.jwt, authReq.apiToken);
        }
        else {
            const result = await chatwoot_1.default.getContacts(accountId, pageNum, authReq.jwt, authReq.apiToken);
            raw = result.payload;
            totalCount = result.meta?.count ?? result.meta?.total_count;
        }
        const contacts = raw.map((c) => ({
            id: c.id,
            name: c.name || '(sem nome)',
            email: c.email,
            phone: c.phone_number,
            avatarUrl: c.thumbnail || c.avatar_url,
            conversationsCount: c.conversations_count ?? 0,
            lastActivityAt: c.last_activity_at,
        }));
        res.json({ contacts, page: pageNum, pageSize: raw.length, total: totalCount });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /contacts failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar contatos' });
    }
});
// GET /api/cwapp/contacts/:id — detalhes do contato
router.get('/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const contactId = parseInt(req.params.id);
    try {
        const c = await chatwoot_1.default.getContact(accountId, contactId, authReq.jwt, authReq.apiToken);
        if (!c)
            return res.status(404).json({ error: 'Contato não encontrado' });
        res.json({
            contact: {
                id: c.id,
                name: c.name || '(sem nome)',
                email: c.email,
                phone: c.phone_number,
                avatarUrl: c.thumbnail || c.avatar_url,
                conversationsCount: c.conversations_count ?? 0,
                location: c.location,
                company: c.company?.name,
                createdAt: c.created_at,
                additionalAttributes: c.additional_attributes,
            },
        });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /contacts/:id failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar contato' });
    }
});
// GET /api/cwapp/contacts/:id/conversations — conversas do contato
router.get('/:id/conversations', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const contactId = parseInt(req.params.id);
    try {
        const raw = await chatwoot_1.default.getContactConversations(accountId, contactId, authReq.apiToken, authReq.jwt);
        // Normaliza as conversas
        const conversations = (Array.isArray(raw) ? raw : []).map((conv) => ({
            id: conv.id,
            status: conv.status,
            inboxName: conv.meta?.channel || conv.inbox_id,
            assigneeName: conv.meta?.assignee?.name,
            lastActivityAt: conv.last_activity_at
                ? new Date(conv.last_activity_at * 1000).toISOString()
                : undefined,
            unreadCount: conv.unread_count || 0,
            lastMessage: conv.last_non_activity_message?.content || '',
        }));
        res.json({ conversations });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /contacts/:id/conversations failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar conversas do contato' });
    }
});
exports.default = router;
//# sourceMappingURL=cwapp-contacts.js.map