"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// GET /api/cwapp/inboxes — lista caixas da conta
router.get('/inboxes', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    try {
        const inboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt, authReq.apiToken);
        const mapped = (inboxes || []).map((i) => ({
            id: i.id,
            name: i.name,
            channelType: i.channel_type,
        }));
        res.json({ inboxes: mapped });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /conversations/inboxes failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar caixas' });
    }
});
// GET /api/cwapp/conversations — lista paginada
router.get('/', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const { status = 'open', page = '1', assignee_type, inbox_id } = req.query;
    try {
        const [conversations, inboxes] = await Promise.all([
            chatwoot_1.default.getConversations(accountId, authReq.jwt, authReq.apiToken, {
                status,
                page: parseInt(page),
                assignee_type: assignee_type || undefined,
                inbox_id: inbox_id ? parseInt(inbox_id) : undefined,
            }),
            chatwoot_1.default.getInboxes(accountId, authReq.jwt, authReq.apiToken),
        ]);
        const inboxMap = new Map((inboxes || []).map((i) => [i.id, i]));
        const mapped = (conversations || []).map((conv) => ({
            id: conv.id,
            status: conv.status,
            contactName: conv.meta?.sender?.name || 'Contato',
            contactAvatarUrl: conv.meta?.sender?.thumbnail || conv.meta?.sender?.avatar_url,
            inboxName: inboxMap.get(conv.inbox_id)?.name,
            assigneeName: conv.meta?.assignee?.name,
            lastActivityAt: conv.last_activity_at
                ? new Date(conv.last_activity_at * 1000).toISOString()
                : undefined,
            unreadCount: conv.unread_count || 0,
        }));
        res.json({ conversations: mapped, totalCount: mapped.length, page: parseInt(page) });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /conversations failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});
// GET /api/cwapp/conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    try {
        const messages = await chatwoot_1.default.getConversationMessages(accountId, conversationId, authReq.jwt, authReq.apiToken);
        // Log estrutura de mensagens com anexos para debug
        const withAttachments = (messages || []).filter((m) => m.attachments?.length > 0);
        if (withAttachments.length > 0) {
            const lastMsg = withAttachments[withAttachments.length - 1];
            logger_1.default.info('Messages with attachments', {
                conversationId,
                count: withAttachments.length,
                lastAttachment: JSON.stringify({
                    file_type: lastMsg?.attachments?.[0]?.file_type,
                    file_name: lastMsg?.attachments?.[0]?.file_name,
                    extension: lastMsg?.attachments?.[0]?.extension,
                    data_url_suffix: (lastMsg?.attachments?.[0]?.data_url || '').slice(-40),
                }),
            });
        }
        res.json({ messages: messages || [] });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /conversations/:id/messages failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});
// POST /api/cwapp/conversations/:id/reply
router.post('/:id/reply', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    const { message } = req.body;
    if (!message?.trim()) {
        return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }
    try {
        const ok = await chatwoot_1.default.sendMessage(accountId, conversationId, message.trim(), authReq.jwt, authReq.apiToken);
        if (ok) {
            res.json({ success: true });
        }
        else {
            res.status(500).json({ error: 'Falha ao enviar mensagem' });
        }
    }
    catch (error) {
        logger_1.default.error('CWApp POST /conversations/:id/reply failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});
// POST /api/cwapp/conversations/:id/read — marca como lido
router.post('/:id/read', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    try {
        await chatwoot_1.default.markConversationAsRead(accountId, conversationId, authReq.jwt, authReq.apiToken);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('CWApp POST /conversations/:id/read failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao marcar como lido' });
    }
});
// GET /api/cwapp/conversations/:id — detalhes
router.get('/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    try {
        const conv = await chatwoot_1.default.getConversation(accountId, conversationId, authReq.jwt, authReq.apiToken);
        res.json({ conversation: conv });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /conversations/:id failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar conversa' });
    }
});
// DELETE /api/cwapp/conversations/:id — deleta conversa
router.delete('/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    try {
        const ok = await chatwoot_1.default.deleteConversation(accountId, conversationId, authReq.jwt, authReq.apiToken);
        if (ok) {
            res.json({ success: true });
        }
        else {
            res.status(500).json({ error: 'Falha ao deletar conversa' });
        }
    }
    catch (error) {
        const status = error.response?.status || 500;
        const msg = error.response?.data?.message
            || error.response?.data?.error
            || error.message
            || 'Erro ao deletar conversa';
        logger_1.default.error('CWApp DELETE /conversations/:id failed', { error: msg, status });
        res.status(status === 403 ? 403 : 500).json({ error: msg });
    }
});
// POST /api/cwapp/conversations/:id/attachment — envia arquivo (imagem, audio, documento)
const UPLOAD_DIR = '/tmp/cwapp-uploads/';
try {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
catch { }
const upload = (0, multer_1.default)({
    dest: UPLOAD_DIR,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
router.post('/:id/attachment', upload.single('file'), async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    const caption = (req.body?.caption || '').trim();
    const file = req.file;
    logger_1.default.info('CWApp attachment POST recebido', {
        conversationId,
        accountId,
        hasFile: !!file,
        mimetype: file?.mimetype,
        originalname: file?.originalname,
        size: file?.size,
    });
    if (!file) {
        logger_1.default.warn('CWApp attachment: nenhum arquivo no request', { conversationId });
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    let namedPath = null;
    let convertedPath = null;
    try {
        // Renomeia para ter a extensão correta (Chatwoot precisa)
        const ext = path_1.default.extname(file.originalname) || '.bin';
        namedPath = file.path + ext;
        fs_1.default.renameSync(file.path, namedPath);
        // Se for áudio webm, converte para ogg (opus remux) para compatibilidade com WhatsApp.
        // WebM não é suportado pelo WhatsApp — OGG Opus é o formato nativo de mensagens de voz.
        // A conversão é apenas remux (sem recodificação), então é praticamente instantânea.
        let sendPath = namedPath;
        const isAudioWebm = file.mimetype?.startsWith('audio/') && namedPath.endsWith('.webm');
        if (isAudioWebm) {
            const oggPath = namedPath.replace('.webm', '.ogg');
            try {
                (0, child_process_1.execSync)(`ffmpeg -i "${namedPath}" -c:a copy -f ogg "${oggPath}" -y 2>/dev/null`);
                convertedPath = oggPath;
                sendPath = oggPath;
                logger_1.default.info('Audio converted from webm to ogg for WhatsApp compatibility', { conversationId });
            }
            catch (convErr) {
                logger_1.default.warn('ffmpeg conversion failed, sending original webm', { conversationId });
            }
        }
        const ok = await chatwoot_1.default.sendMessage(accountId, conversationId, caption, authReq.jwt, authReq.apiToken, sendPath);
        // Remove arquivos temporários
        try {
            if (namedPath)
                fs_1.default.unlinkSync(namedPath);
        }
        catch { }
        try {
            if (convertedPath)
                fs_1.default.unlinkSync(convertedPath);
        }
        catch { }
        if (ok) {
            res.json({ success: true });
        }
        else {
            res.status(500).json({ error: 'Falha ao enviar arquivo' });
        }
    }
    catch (error) {
        // Limpa arquivos em caso de erro
        try {
            if (file?.path)
                fs_1.default.unlinkSync(file.path);
        }
        catch { }
        try {
            if (namedPath)
                fs_1.default.unlinkSync(namedPath);
        }
        catch { }
        try {
            if (convertedPath)
                fs_1.default.unlinkSync(convertedPath);
        }
        catch { }
        logger_1.default.error('CWApp POST /conversations/:id/attachment failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao enviar arquivo' });
    }
});
// GET /api/cwapp/conversations/:id/agents — lista agentes da conta
router.get('/:id/agents', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    try {
        const agents = await chatwoot_1.default.getAccountAgents(accountId, authReq.jwt, authReq.apiToken);
        res.json({ agents: agents || [] });
    }
    catch (error) {
        logger_1.default.error('CWApp GET /conversations/:id/agents failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar agentes' });
    }
});
// POST /api/cwapp/conversations/:id/assign — atribui agente à conversa
router.post('/:id/assign', async (req, res) => {
    const authReq = req;
    const accountId = authReq.accountId;
    const conversationId = parseInt(req.params.id);
    const { agentId } = req.body;
    if (!agentId)
        return res.status(400).json({ error: 'agentId obrigatório' });
    try {
        const ok = await chatwoot_1.default.assignAgent(conversationId, agentId, accountId, authReq.jwt, authReq.apiToken);
        if (ok)
            res.json({ success: true });
        else
            res.status(500).json({ error: 'Falha ao atribuir agente' });
    }
    catch (error) {
        logger_1.default.error('CWApp POST /conversations/:id/assign failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao atribuir agente' });
    }
});
exports.default = router;
//# sourceMappingURL=cwapp-conversations.js.map