"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const encryption_1 = require("../utils/encryption");
const router = (0, express_1.Router)();
// Configuração do Multer para upload de arquivos
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
// Garante que o diretório existe
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const uniqueName = `${(0, uuid_1.v4)()}${ext}`;
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Tipo de arquivo não permitido'));
        }
    }
});
// ==========================================
// DETALHES DA CONVERSA
// ==========================================
// GET /api/conversations/:id/details - Retorna detalhes da conversa + mensagens
router.get('/:id/details', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    try {
        const accountId = authReq.user.account_id;
        // Busca detalhes da conversa no Chatwoot
        let conversation = null;
        let conversationDeleted = false;
        try {
            conversation = await chatwoot_1.default.getConversation(accountId, conversationId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
        }
        catch (convError) {
            // Se erro 404, marca como deletada mas continua
            logger_1.default.warn('Conversation not found in Chatwoot, marked as deleted', { conversationId });
            conversationDeleted = true;
        }
        // Busca mensagens recentes (se conversa existir)
        let messages = [];
        if (conversation && !conversationDeleted) {
            try {
                messages = await chatwoot_1.default.getConversationMessages(accountId, conversationId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
            }
            catch (msgError) {
                logger_1.default.warn('Failed to fetch messages for conversation', { conversationId });
            }
        }
        // Busca dados extras do banco local (sempre busca, mesmo se conversa deletada)
        const [tasks, attachments, scheduledMessages, card] = await Promise.all([
            database_1.default.task.findMany({
                where: { conversationId, accountId },
                orderBy: { createdAt: 'desc' }
            }),
            database_1.default.attachment.findMany({
                where: { conversationId, accountId },
                orderBy: { createdAt: 'desc' }
            }),
            database_1.default.scheduledMessage.findMany({
                where: { conversationId, accountId },
                orderBy: { scheduledAt: 'asc' }
            }),
            database_1.default.card.findFirst({
                where: { conversationId, accountId },
                include: {
                    stage: {
                        select: { funnelId: true }
                    }
                }
            })
        ]);
        // Monta URL do Chatwoot
        const chatwootUrl = `${process.env.CHATWOOT_API_URL}/app/accounts/${accountId}/conversations/${conversationId}`;
        // Se conversa deletada, cria objeto mock com dados do card
        const conversationData = conversation || (conversationDeleted && card ? {
            id: conversationId,
            status: 'deleted',
            priority: null,
            meta: {
                assignee: null,
                sender: card.customName ? { name: card.customName } : { name: `Conversa #${conversationId}` }
            },
            inbox: { id: 0, name: 'Desconhecida' },
            labels: [],
            additional_attributes: {},
            custom_attributes: {},
            created_at: 0,
            unread_count: 0
        } : null);
        res.json({
            success: true,
            data: {
                conversation: conversationData,
                conversationDeleted, // Flag para frontend saber que foi deletada
                messages: messages.slice(0, 50), // Últimas 50 mensagens
                tasks,
                attachments,
                scheduledMessages,
                chatwootUrl,
                funnelId: card?.stage?.funnelId,
                cardName: card?.customName // Nome customizado do card
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching conversation details', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao buscar detalhes da conversa' });
    }
});
// ==========================================
// TAREFAS
// ==========================================
// GET /api/conversations/:id/tasks - Lista tarefas
router.get('/:id/tasks', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    try {
        const tasks = await database_1.default.task.findMany({
            where: {
                conversationId,
                accountId: authReq.user.account_id
            },
            orderBy: [
                { completed: 'asc' },
                { dueDate: 'asc' },
                { createdAt: 'desc' }
            ]
        });
        res.json({ success: true, data: tasks });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching tasks', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao buscar tarefas' });
    }
});
// POST /api/conversations/:id/tasks - Criar tarefa
router.post('/:id/tasks', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { title, dueDate } = req.body;
    if (!title?.trim()) {
        return res.status(400).json({ error: 'Título é obrigatório' });
    }
    try {
        const task = await database_1.default.task.create({
            data: {
                conversationId,
                accountId: authReq.user.account_id,
                title: title.trim(),
                dueDate: dueDate ? new Date(dueDate) : null,
                createdBy: authReq.user.id
            }
        });
        logger_1.default.info('Task created', { taskId: task.id, conversationId });
        res.status(201).json({ success: true, data: task });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error creating task', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao criar tarefa' });
    }
});
// PATCH /api/conversations/:id/tasks/:taskId - Atualizar tarefa
router.patch('/:id/tasks/:taskId', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    const { title, completed, dueDate } = req.body;
    try {
        // Verifica se a tarefa existe e pertence à conta
        const existing = await database_1.default.task.findFirst({
            where: {
                id: taskId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        }
        const task = await database_1.default.task.update({
            where: { id: taskId },
            data: {
                ...(title !== undefined && { title: title.trim() }),
                ...(completed !== undefined && { completed }),
                ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null })
            }
        });
        logger_1.default.info('Task updated', { taskId, conversationId });
        res.json({ success: true, data: task });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error updating task', { taskId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao atualizar tarefa' });
    }
});
// DELETE /api/conversations/:id/tasks/:taskId - Deletar tarefa
router.delete('/:id/tasks/:taskId', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    try {
        const existing = await database_1.default.task.findFirst({
            where: {
                id: taskId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        }
        await database_1.default.task.delete({ where: { id: taskId } });
        logger_1.default.info('Task deleted', { taskId, conversationId });
        res.json({ success: true, message: 'Tarefa removida' });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error deleting task', { taskId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao remover tarefa' });
    }
});
// ==========================================
// ANEXOS
// ==========================================
// GET /api/conversations/:id/attachments - Lista anexos
router.get('/:id/attachments', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    try {
        const attachments = await database_1.default.attachment.findMany({
            where: {
                conversationId,
                accountId: authReq.user.account_id
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: attachments });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching attachments', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao buscar anexos' });
    }
});
// POST /api/conversations/:id/attachments - Upload de anexo
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    if (!req.file) {
        return res.status(400).json({ error: 'Arquivo é obrigatório' });
    }
    try {
        const attachment = await database_1.default.attachment.create({
            data: {
                conversationId,
                accountId: authReq.user.account_id,
                fileName: req.file.filename,
                originalName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                filePath: req.file.path,
                uploadedBy: authReq.user.id
            }
        });
        logger_1.default.info('Attachment uploaded', { attachmentId: attachment.id, conversationId });
        res.status(201).json({ success: true, data: attachment });
    }
    catch (error) {
        // Remove arquivo se falhou ao salvar no banco
        if (req.file?.path) {
            fs_1.default.unlink(req.file.path, () => { });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error uploading attachment', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao fazer upload do anexo' });
    }
});
// GET /api/conversations/:id/attachments/:attachmentId/download - Download de anexo
router.get('/:id/attachments/:attachmentId/download', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const attachmentId = parseInt(req.params.attachmentId);
    try {
        const attachment = await database_1.default.attachment.findFirst({
            where: {
                id: attachmentId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!attachment) {
            return res.status(404).json({ error: 'Anexo não encontrado' });
        }
        if (!fs_1.default.existsSync(attachment.filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
        }
        res.download(attachment.filePath, attachment.originalName);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error downloading attachment', { attachmentId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao baixar anexo' });
    }
});
// DELETE /api/conversations/:id/attachments/:attachmentId - Deletar anexo
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const attachmentId = parseInt(req.params.attachmentId);
    try {
        const attachment = await database_1.default.attachment.findFirst({
            where: {
                id: attachmentId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!attachment) {
            return res.status(404).json({ error: 'Anexo não encontrado' });
        }
        // Remove arquivo do disco
        if (fs_1.default.existsSync(attachment.filePath)) {
            fs_1.default.unlinkSync(attachment.filePath);
        }
        // Remove do banco
        await database_1.default.attachment.delete({ where: { id: attachmentId } });
        logger_1.default.info('Attachment deleted', { attachmentId, conversationId });
        res.json({ success: true, message: 'Anexo removido' });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error deleting attachment', { attachmentId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao remover anexo' });
    }
});
// ==========================================
// MENSAGENS AGENDADAS
// ==========================================
// GET /api/conversations/:id/scheduled-messages - Lista mensagens agendadas
router.get('/:id/scheduled-messages', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    try {
        const messages = await database_1.default.scheduledMessage.findMany({
            where: {
                conversationId,
                accountId: authReq.user.account_id
            },
            orderBy: { scheduledAt: 'asc' }
        });
        res.json({ success: true, data: messages });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error fetching scheduled messages', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao buscar mensagens agendadas' });
    }
});
// POST /api/conversations/:id/scheduled-messages - Criar mensagem agendada
router.post('/:id/scheduled-messages', upload.single('attachment'), async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const { message, scheduledAt } = req.body;
    // Permite mensagem vazia se houver anexo
    if (!message?.trim() && !req.file) {
        return res.status(400).json({ error: 'Mensagem ou anexo é obrigatório' });
    }
    if (!scheduledAt) {
        return res.status(400).json({ error: 'Data/hora de agendamento é obrigatória' });
    }
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
        return res.status(400).json({ error: 'A data de agendamento deve ser no futuro' });
    }
    try {
        // Prepara os dados de autenticação para salvar
        const authData = {};
        if (authReq.apiToken) {
            // Se tem API token, criptografa antes de salvar
            authData.apiToken = (0, encryption_1.encryptOptional)(authReq.apiToken) ?? undefined;
            logger_1.default.info('Saving scheduled message with API token', {
                userId: authReq.user.id,
                conversationId
            });
        }
        else if (authReq.jwt['access-token']) {
            // Se está autenticado com JWT, criptografa os headers antes de salvar
            authData.jwtAccessToken = (0, encryption_1.encryptOptional)(authReq.jwt['access-token']) ?? undefined;
            authData.jwtClient = (0, encryption_1.encryptOptional)(authReq.jwt.client) ?? undefined;
            authData.jwtUid = (0, encryption_1.encryptOptional)(authReq.jwt.uid) ?? undefined;
            authData.jwtExpiry = (0, encryption_1.encryptOptional)(authReq.jwt.expiry) ?? undefined;
            authData.jwtTokenType = (0, encryption_1.encryptOptional)(authReq.jwt['token-type']) ?? undefined;
            logger_1.default.info('Saving scheduled message with JWT headers (encrypted)', {
                userId: authReq.user.id,
                conversationId,
                hasJWT: true
            });
        }
        else {
            logger_1.default.warn('No authentication data available for scheduled message', {
                userId: authReq.user.id,
                conversationId
            });
        }
        // Processa anexo se houver
        let attachmentsData = null;
        if (req.file) {
            const attachment = {
                fileName: req.file.filename,
                filePath: req.file.path,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                originalName: req.file.originalname
            };
            attachmentsData = JSON.stringify([attachment]);
            logger_1.default.info('Attachment uploaded for scheduled message', {
                fileName: req.file.filename,
                size: req.file.size,
                type: req.file.mimetype
            });
        }
        const scheduledMessage = await database_1.default.scheduledMessage.create({
            data: {
                conversationId,
                accountId: authReq.user.account_id,
                message: message?.trim() || '',
                scheduledAt: scheduledDate,
                createdBy: authReq.user.id,
                attachments: attachmentsData,
                ...authData
            }
        });
        logger_1.default.info('Scheduled message created', {
            id: scheduledMessage.id,
            conversationId,
            scheduledAt,
            hasApiToken: !!authData.apiToken,
            hasJWT: !!authData.jwtAccessToken,
            hasAttachment: !!attachmentsData
        });
        res.status(201).json({ success: true, data: scheduledMessage });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error creating scheduled message', { conversationId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao criar mensagem agendada' });
    }
});
// PATCH /api/conversations/:id/scheduled-messages/:msgId - Atualizar mensagem agendada
router.patch('/:id/scheduled-messages/:msgId', upload.single('attachment'), async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const msgId = parseInt(req.params.msgId);
    const { message, scheduledAt, removeAttachment } = req.body;
    try {
        const existing = await database_1.default.scheduledMessage.findFirst({
            where: {
                id: msgId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Mensagem agendada não encontrada' });
        }
        if (existing.status !== 'pending') {
            return res.status(400).json({ error: 'Não é possível editar mensagens já enviadas ou canceladas' });
        }
        const updateData = {};
        // Valida se está tentando deixar mensagem e anexo vazios
        const willHaveMessage = message !== undefined ? message.trim() : existing.message;
        const willHaveAttachment = req.file || (existing.attachments && removeAttachment !== 'true' && removeAttachment !== true);
        if (!willHaveMessage && !willHaveAttachment) {
            return res.status(400).json({ error: 'Mensagem ou anexo é obrigatório' });
        }
        if (message !== undefined) {
            updateData.message = message.trim() || '';
        }
        if (scheduledAt !== undefined) {
            const scheduledDate = new Date(scheduledAt);
            if (scheduledDate <= new Date()) {
                return res.status(400).json({ error: 'A data de agendamento deve ser no futuro' });
            }
            updateData.scheduledAt = scheduledDate;
        }
        // Processa anexo
        if (req.file) {
            // Remove anexo antigo se existir
            if (existing.attachments) {
                try {
                    const oldAttachments = JSON.parse(existing.attachments);
                    for (const att of oldAttachments) {
                        if (fs_1.default.existsSync(att.filePath)) {
                            fs_1.default.unlinkSync(att.filePath);
                        }
                    }
                }
                catch (e) {
                    logger_1.default.warn('Failed to delete old attachment', { msgId });
                }
            }
            const attachment = {
                fileName: req.file.filename,
                filePath: req.file.path,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                originalName: req.file.originalname
            };
            updateData.attachments = JSON.stringify([attachment]);
            logger_1.default.info('New attachment uploaded', { msgId, fileName: req.file.filename });
        }
        else if (removeAttachment === 'true' || removeAttachment === true) {
            // Remove anexo se solicitado
            if (existing.attachments) {
                try {
                    const oldAttachments = JSON.parse(existing.attachments);
                    for (const att of oldAttachments) {
                        if (fs_1.default.existsSync(att.filePath)) {
                            fs_1.default.unlinkSync(att.filePath);
                        }
                    }
                }
                catch (e) {
                    logger_1.default.warn('Failed to delete attachment', { msgId });
                }
            }
            updateData.attachments = null;
            logger_1.default.info('Attachment removed', { msgId });
        }
        const updated = await database_1.default.scheduledMessage.update({
            where: { id: msgId },
            data: updateData
        });
        logger_1.default.info('Scheduled message updated', { id: msgId, conversationId });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error updating scheduled message', { msgId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao atualizar mensagem agendada' });
    }
});
// DELETE /api/conversations/:id/scheduled-messages/:msgId - Cancelar mensagem agendada
router.delete('/:id/scheduled-messages/:msgId', async (req, res) => {
    const authReq = req;
    const conversationId = parseInt(req.params.id);
    const msgId = parseInt(req.params.msgId);
    try {
        const existing = await database_1.default.scheduledMessage.findFirst({
            where: {
                id: msgId,
                conversationId,
                accountId: authReq.user.account_id
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Mensagem agendada não encontrada' });
        }
        if (existing.status === 'sent') {
            return res.status(400).json({ error: 'Não é possível cancelar mensagens já enviadas' });
        }
        // Se está pendente, marca como cancelada; se já falhou/cancelada, remove
        if (existing.status === 'pending') {
            await database_1.default.scheduledMessage.update({
                where: { id: msgId },
                data: { status: 'cancelled' }
            });
            logger_1.default.info('Scheduled message cancelled', { id: msgId, conversationId });
            res.json({ success: true, message: 'Mensagem agendada cancelada' });
        }
        else {
            await database_1.default.scheduledMessage.delete({ where: { id: msgId } });
            logger_1.default.info('Scheduled message deleted', { id: msgId, conversationId });
            res.json({ success: true, message: 'Mensagem agendada removida' });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error cancelling scheduled message', { msgId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao cancelar mensagem agendada' });
    }
});
// ==========================================
// ENCAMINHAMENTO DE MENSAGENS
// ==========================================
// POST /api/forward-message - Encaminha mensagem para nova conversa em outra inbox
router.post('/forward-message', async (req, res) => {
    const authReq = req;
    const { inboxId, contactIdentifier, message, attachments, name, phone_number, email, custom_attributes } = req.body;
    if (!inboxId) {
        return res.status(400).json({ error: 'Inbox é obrigatória' });
    }
    if (!contactIdentifier?.trim()) {
        return res.status(400).json({ error: 'Identificador do contato (telefone/email) é obrigatório' });
    }
    if (!message?.trim() && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ error: 'Mensagem ou anexos são obrigatórios' });
    }
    try {
        const accountId = authReq.user.account_id;
        const jwt = authReq.jwt['access-token'] ? authReq.jwt : undefined;
        const apiToken = authReq.jwt['access-token'] ? undefined : authReq.apiToken;
        logger_1.default.info('Starting message forward', {
            inboxId,
            contactIdentifier,
            accountId,
            hasMessage: !!message,
            hasAttachments: !!(attachments && attachments.length > 0)
        });
        // 1. Busca contato existente por identificador
        const searchResults = await chatwoot_1.default.searchContacts(accountId, contactIdentifier.trim(), jwt, apiToken);
        let contact = searchResults.find(c => c.phone_number === contactIdentifier.trim() || c.email === contactIdentifier.trim()) || null;
        // 2. Se não encontrou, cria novo contato
        if (!contact) {
            logger_1.default.info('Contact not found, creating new', { contactIdentifier });
            const isEmail = contactIdentifier.includes('@');
            const contactData = {
                inbox_id: parseInt(inboxId)
            };
            if (isEmail) {
                contactData.email = email?.trim() || contactIdentifier.trim();
                contactData.name = name?.trim() || contactIdentifier.split('@')[0];
            }
            else {
                contactData.phone_number = phone_number?.trim() || contactIdentifier.trim();
                contactData.name = name?.trim() || contactIdentifier.trim();
            }
            if (email?.trim() && !isEmail) contactData.email = email.trim();
            if (phone_number?.trim() && isEmail) contactData.phone_number = phone_number.trim();
            if (custom_attributes && typeof custom_attributes === 'object') contactData.custom_attributes = custom_attributes;
            contact = await chatwoot_1.default.createContact(accountId, contactData, jwt, apiToken);
            if (!contact) {
                return res.status(500).json({ error: 'Falha ao criar contato' });
            }
            logger_1.default.info('Contact created', { contactId: contact.id });
        }
        else {
            logger_1.default.info('Contact found', { contactId: contact.id });
        }
        // 3. Cria nova conversa na inbox especificada
        const sourceId = `forward-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const conversation = await chatwoot_1.default.createConversation(accountId, {
            source_id: sourceId,
            inbox_id: parseInt(inboxId),
            contact_id: contact.id,
            status: 'open',
            additional_attributes: {
                forwarded_from: message ? 'kanban-widget' : 'kanban-widget-attachment-only'
            }
        }, jwt, apiToken);
        if (!conversation) {
            return res.status(500).json({ error: 'Falha ao criar conversa' });
        }
        logger_1.default.info('Conversation created', { conversationId: conversation.id });
        // 4. Envia mensagem para a nova conversa
        // TODO: Se houver attachments, fazer download e enviar via sendMessage com attachmentPath
        // Por enquanto, vamos enviar apenas a mensagem de texto
        const success = await chatwoot_1.default.sendMessage(accountId, conversation.id, message?.trim() || '📎 Mensagem encaminhada com anexos', jwt, apiToken);
        if (!success) {
            logger_1.default.warn('Failed to send message to new conversation', { conversationId: conversation.id });
            // Não falha a requisição, pois a conversa já foi criada
        }
        logger_1.default.info('Message forwarded successfully', {
            conversationId: conversation.id,
            contactId: contact.id,
            inboxId
        });
        res.status(201).json({
            success: true,
            data: {
                conversation,
                contact,
                message: 'Mensagem encaminhada com sucesso'
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error forwarding message', { error: errorMessage });
        res.status(500).json({ error: 'Falha ao encaminhar mensagem' });
    }
});
exports.default = router;
//# sourceMappingURL=conversation-details.js.map