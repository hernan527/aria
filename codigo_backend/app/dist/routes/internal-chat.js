"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setInternalChatSocketIO = setInternalChatSocketIO;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../services/database"));
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Configuração do multer para upload de arquivos
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path_1.default.join(__dirname, '../../uploads');
        logger_1.default.debug('Upload destination path', { uploadPath, __dirname });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
        logger_1.default.debug('Generated filename for upload', { originalName: file.originalname, uniqueName });
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        // Aceita imagens, áudio, vídeo e documentos
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
            'video/mp4', 'video/webm',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Tipo de arquivo não permitido'));
        }
    }
});
let io = null;
function setInternalChatSocketIO(socketIO) {
    io = socketIO;
}
// GET /api/internal-chats - Lista chats do usuário
router.get('/', async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    try {
        // Busca chats onde o usuário é membro
        const chats = await database_1.default.internalChat.findMany({
            where: {
                accountId,
                members: {
                    some: {
                        userId
                    }
                }
            },
            include: {
                members: true,
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1 // Última mensagem apenas
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        logger_1.default.info('Internal chats listed', { userId, accountId, count: chats.length });
        res.json(chats);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to list internal chats', { userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao listar chats internos' });
    }
});
// POST /api/internal-chats - Cria novo chat (apenas admin)
router.post('/', async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    const { name, memberIds } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nome do chat é obrigatório' });
    }
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ error: 'Selecione pelo menos um membro' });
    }
    try {
        // Cria o chat com os membros
        const chat = await database_1.default.internalChat.create({
            data: {
                name: name.trim(),
                accountId,
                createdBy: userId,
                members: {
                    create: memberIds.map((memberId) => ({
                        userId: memberId
                    }))
                }
            },
            include: {
                members: true,
                messages: true
            }
        });
        logger_1.default.info('Internal chat created', { chatId: chat.id, userId, accountId, memberCount: memberIds.length });
        res.status(201).json(chat);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to create internal chat', { userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao criar chat interno' });
    }
});
// GET /api/internal-chats/:id - Detalhes do chat
router.get('/:id', async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'ID do chat inválido' });
    }
    try {
        // Busca chat verificando se o usuário é membro
        const chat = await database_1.default.internalChat.findFirst({
            where: {
                id: chatId,
                accountId,
                members: {
                    some: {
                        userId
                    }
                }
            },
            include: {
                members: true,
                messages: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat não encontrado ou você não tem acesso' });
        }
        // Busca informações dos usuários do Chatwoot
        const agents = await chatwoot_1.default.getAccountAgents(accountId, authReq.jwt, authReq.apiToken);
        const userMap = new Map(agents.map((agent) => [agent.id, agent.name]));
        // Adiciona nome do usuário em cada mensagem
        const messagesWithNames = chat.messages.map(msg => ({
            ...msg,
            userName: userMap.get(msg.userId) || 'Usuário Desconhecido'
        }));
        logger_1.default.info('Internal chat details fetched', { chatId, userId, accountId });
        res.json({
            ...chat,
            messages: messagesWithNames
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to fetch internal chat details', { chatId, userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao buscar detalhes do chat' });
    }
});
// POST /api/internal-chats/:id/messages - Envia mensagem no chat
router.post('/:id/messages', upload.array('files', 5), async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    const chatId = parseInt(req.params.id);
    const { content } = req.body;
    const files = req.files;
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'ID do chat inválido' });
    }
    if ((!content || !content.trim()) && (!files || files.length === 0)) {
        return res.status(400).json({ error: 'Mensagem ou arquivos são obrigatórios' });
    }
    try {
        // Verifica se o usuário é membro do chat
        const membership = await database_1.default.internalChatMember.findFirst({
            where: {
                chatId,
                userId,
                chat: {
                    accountId
                }
            }
        });
        if (!membership) {
            return res.status(403).json({ error: 'Você não tem acesso a este chat' });
        }
        // Prepara anexos se houver arquivos
        const attachmentsData = files && files.length > 0
            ? files.map(file => ({
                filename: file.filename,
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                url: `/uploads/${file.filename}`
            }))
            : [];
        // Cria a mensagem
        const message = await database_1.default.internalChatMessage.create({
            data: {
                chatId,
                userId,
                content: content?.trim() || '',
                attachments: attachmentsData.length > 0 ? JSON.stringify(attachmentsData) : null
            }
        });
        // Atualiza o updatedAt do chat
        await database_1.default.internalChat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() }
        });
        // Busca nome do usuário
        const agents = await chatwoot_1.default.getAccountAgents(accountId, authReq.jwt, authReq.apiToken);
        const agent = agents.find((a) => a.id === userId);
        const userName = agent?.name || 'Usuário Desconhecido';
        // Emite evento WebSocket para todos os membros do chat
        if (io) {
            io.to(`chat_${chatId}`).emit('new_message', {
                chatId,
                message: {
                    id: message.id,
                    userId: message.userId,
                    userName,
                    content: message.content,
                    attachments: message.attachments,
                    createdAt: message.createdAt
                }
            });
            logger_1.default.debug('WebSocket event emitted', { event: 'new_message', chatId, messageId: message.id });
        }
        logger_1.default.info('Internal chat message sent', { messageId: message.id, chatId, userId, accountId });
        res.status(201).json({
            ...message,
            userName
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to send internal chat message', { chatId, userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao enviar mensagem' });
    }
});
// PUT /api/internal-chats/:id/members - Adiciona/remove membros (apenas admin)
router.put('/:id/members', async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    const chatId = parseInt(req.params.id);
    const { addUserIds, removeUserIds } = req.body;
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'ID do chat inválido' });
    }
    try {
        // Verifica se o chat existe e pertence à conta
        const chat = await database_1.default.internalChat.findFirst({
            where: { id: chatId, accountId }
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat não encontrado' });
        }
        // Adiciona novos membros
        if (addUserIds && Array.isArray(addUserIds) && addUserIds.length > 0) {
            await Promise.all(addUserIds.map((memberId) => database_1.default.internalChatMember.upsert({
                where: {
                    chatId_userId: {
                        chatId,
                        userId: memberId
                    }
                },
                create: {
                    chatId,
                    userId: memberId
                },
                update: {} // Não faz nada se já existe
            })));
        }
        // Remove membros
        if (removeUserIds && Array.isArray(removeUserIds) && removeUserIds.length > 0) {
            await database_1.default.internalChatMember.deleteMany({
                where: {
                    chatId,
                    userId: {
                        in: removeUserIds
                    }
                }
            });
        }
        // Busca chat atualizado
        const updatedChat = await database_1.default.internalChat.findUnique({
            where: { id: chatId },
            include: {
                members: true
            }
        });
        logger_1.default.info('Internal chat members updated', {
            chatId,
            userId,
            accountId,
            addedCount: addUserIds?.length || 0,
            removedCount: removeUserIds?.length || 0
        });
        res.json(updatedChat);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update internal chat members', { chatId, userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao atualizar membros do chat' });
    }
});
// DELETE /api/internal-chats/:id - Deleta chat (apenas admin)
router.delete('/:id', async (req, res) => {
    const authReq = req;
    const userId = authReq.user.id;
    const accountId = authReq.user.account_id;
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
        return res.status(400).json({ error: 'ID do chat inválido' });
    }
    try {
        // Verifica se o chat existe e pertence à conta
        const chat = await database_1.default.internalChat.findFirst({
            where: { id: chatId, accountId }
        });
        if (!chat) {
            return res.status(404).json({ error: 'Chat não encontrado' });
        }
        // Deleta o chat (cascade deleta membros e mensagens)
        await database_1.default.internalChat.delete({
            where: { id: chatId }
        });
        logger_1.default.info('Internal chat deleted', { chatId, userId, accountId });
        res.json({ success: true, message: 'Chat deletado com sucesso' });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to delete internal chat', { chatId, userId, accountId, error: errorMessage });
        res.status(500).json({ error: 'Falha ao deletar chat' });
    }
});
exports.default = router;
//# sourceMappingURL=internal-chat.js.map