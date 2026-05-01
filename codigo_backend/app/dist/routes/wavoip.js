"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const systemSettings_1 = require("../services/systemSettings");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const router = (0, express_1.Router)();
// ============================================================================
// WAVOIP TOKENS — associados a conexões WhatsApp por instanceName
// ============================================================================
// GET /api/wavoip/tokens — lista tokens da conta (mascarados)
router.get('/tokens', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const tokens = await database_1.default.wavoipToken.findMany({
            where: { accountId },
            orderBy: { createdAt: 'asc' },
        });
        const masked = tokens.map(t => ({
            id: t.id,
            instanceName: t.instanceName,
            provider: t.provider,
            deviceTokenMasked: t.deviceToken
                ? t.deviceToken.slice(0, 6) + '...' + t.deviceToken.slice(-4)
                : '***',
            createdAt: t.createdAt,
        }));
        res.json({ data: masked });
    }
    catch (error) {
        logger_1.default.error('Failed to list wavoip tokens', { error: error?.message });
        res.status(500).json({ error: 'Erro ao listar tokens Wavoip' });
    }
});
// GET /api/wavoip/tokens/all — retorna tokens reais para inicializar o SDK no frontend
router.get('/tokens/all', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const tokens = await database_1.default.wavoipToken.findMany({
            where: { accountId },
        });
        const decrypted = tokens.map(t => ({
            instanceName: t.instanceName,
            provider: t.provider,
            deviceToken: (0, systemSettings_1.decrypt)(t.deviceToken),
        }));
        res.json({ data: decrypted });
    }
    catch (error) {
        logger_1.default.error('Failed to fetch wavoip tokens for SDK', { error: error?.message });
        res.status(500).json({ error: 'Erro ao buscar tokens Wavoip' });
    }
});
// POST /api/wavoip/tokens — salva ou atualiza token de uma conexão
router.post('/tokens', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName, provider, deviceToken } = req.body;
        if (!instanceName || !deviceToken) {
            return res.status(400).json({ error: 'instanceName e deviceToken são obrigatórios' });
        }
        const encrypted = (0, systemSettings_1.encrypt)(deviceToken.trim());
        const token = await database_1.default.wavoipToken.upsert({
            where: { accountId_instanceName: { accountId, instanceName } },
            update: {
                provider: provider || 'evolution',
                deviceToken: encrypted,
            },
            create: {
                accountId,
                instanceName,
                provider: provider || 'evolution',
                deviceToken: encrypted,
            },
        });
        logger_1.default.info('Wavoip token saved', { accountId, instanceName });
        res.json({
            data: {
                id: token.id,
                instanceName: token.instanceName,
                provider: token.provider,
                deviceTokenMasked: deviceToken.slice(0, 6) + '...' + deviceToken.slice(-4),
                createdAt: token.createdAt,
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to save wavoip token', { error: error?.message });
        res.status(500).json({ error: 'Erro ao salvar token Wavoip' });
    }
});
// DELETE /api/wavoip/tokens/:instanceName — remove token de uma conexão
router.delete('/tokens/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        const existing = await database_1.default.wavoipToken.findUnique({
            where: { accountId_instanceName: { accountId, instanceName } },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Token não encontrado' });
        }
        await database_1.default.wavoipToken.delete({
            where: { accountId_instanceName: { accountId, instanceName } },
        });
        logger_1.default.info('Wavoip token removed', { accountId, instanceName });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Failed to delete wavoip token', { error: error?.message });
        res.status(500).json({ error: 'Erro ao remover token Wavoip' });
    }
});
// ============================================================================
// GRAVAÇÕES — upload e download de áudio das chamadas
// ============================================================================
const recDir = path_1.default.join(__dirname, '../../uploads/recordings');
const recStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        fs_1.default.mkdirSync(recDir, { recursive: true });
        cb(null, recDir);
    },
    filename: (req, file, cb) => {
        const ext = file.originalname.endsWith('.ogg') ? '.ogg' : '.webm';
        cb(null, `rec-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
});
const uploadRec = (0, multer_1.default)({
    storage: recStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'application/octet-stream'];
        cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith('.webm') || file.originalname.endsWith('.ogg'));
    },
});
// POST /api/wavoip/recordings/upload — recebe arquivo de áudio do frontend
router.post('/recordings/upload', uploadRec.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo de áudio obrigatório' });
        }
        const relativePath = `recordings/${req.file.filename}`;
        res.json({ data: { path: relativePath, size: req.file.size } });
    }
    catch (error) {
        logger_1.default.error('Failed to upload recording', { error: error?.message });
        res.status(500).json({ error: 'Erro ao salvar gravação' });
    }
});
// GET /api/wavoip/recordings/:filename — serve arquivo de áudio (autenticado)
router.get('/recordings/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        // Prevenir path traversal
        const safe = path_1.default.basename(filename);
        const filePath = path_1.default.join(recDir, safe);
        if (!fs_1.default.existsSync(filePath)) {
            return res.status(404).json({ error: 'Gravação não encontrada' });
        }
        res.sendFile(filePath);
    }
    catch (error) {
        logger_1.default.error('Failed to serve recording', { error: error?.message });
        res.status(500).json({ error: 'Erro ao servir gravação' });
    }
});
// ============================================================================
// CALL HISTORY — histórico de chamadas
// ============================================================================
// GET /api/wavoip/calls/stats — métricas agregadas
router.get('/calls/stats', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const from = req.query.from ? new Date(req.query.from) : undefined;
        const to = req.query.to ? new Date(req.query.to) : undefined;
        const where = { accountId, conversationId: { not: null } };
        if (from || to) {
            where.createdAt = {};
            if (from)
                where.createdAt.gte = from;
            if (to)
                where.createdAt.lte = to;
        }
        const [total, outgoing, incoming, ended, missed, rejected, withRecording, durationAgg] = await Promise.all([
            database_1.default.callHistory.count({ where }),
            database_1.default.callHistory.count({ where: { ...where, direction: 'OUTGOING' } }),
            database_1.default.callHistory.count({ where: { ...where, direction: 'INCOMING' } }),
            database_1.default.callHistory.count({ where: { ...where, status: 'ENDED' } }),
            database_1.default.callHistory.count({ where: { ...where, status: 'NOT_ANSWERED' } }),
            database_1.default.callHistory.count({ where: { ...where, status: 'REJECTED' } }),
            database_1.default.callHistory.count({ where: { ...where, recordingPath: { not: null } } }),
            database_1.default.callHistory.aggregate({
                where: { ...where, status: 'ENDED' },
                _sum: { durationSeconds: true },
            }),
        ]);
        const answered = ended;
        const answerRate = total > 0 ? Math.round((answered / total) * 1000) / 10 : 0;
        const totalDurationSeconds = durationAgg._sum.durationSeconds || 0;
        res.json({
            data: {
                totalCalls: total,
                totalDurationSeconds,
                outgoing,
                incoming,
                answered,
                missed,
                rejected,
                withRecording,
                answerRate,
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to fetch call stats', { error: error?.message });
        res.status(500).json({ error: 'Erro ao buscar estatísticas de chamadas' });
    }
});
// GET /api/wavoip/calls — histórico paginado com filtros
router.get('/calls', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const conversationId = req.query.conversationId
            ? parseInt(req.query.conversationId)
            : undefined;
        const search = req.query.search?.trim() || undefined;
        const direction = req.query.direction || undefined;
        const status = req.query.status || undefined;
        const from = req.query.from ? new Date(req.query.from) : undefined;
        const to = req.query.to ? new Date(req.query.to) : undefined;
        const where = { accountId, conversationId: { not: null } };
        if (conversationId)
            where.conversationId = conversationId;
        if (direction)
            where.direction = direction;
        if (status)
            where.status = status;
        if (from || to) {
            where.createdAt = {};
            if (from)
                where.createdAt.gte = from;
            if (to)
                where.createdAt.lte = to;
        }
        if (search) {
            where.OR = [
                { contactPhone: { contains: search, mode: 'insensitive' } },
                { contactName: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [calls, total] = await Promise.all([
            database_1.default.callHistory.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            database_1.default.callHistory.count({ where }),
        ]);
        res.json({ data: calls, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (error) {
        logger_1.default.error('Failed to fetch call history', { error: error?.message });
        res.status(500).json({ error: 'Erro ao buscar histórico de chamadas' });
    }
});
// POST /api/wavoip/calls — salva registro de chamada
router.post('/calls', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { conversationId, contactPhone, contactName, direction, status, instanceName, durationSeconds, startedAt, endedAt, recordingPath, recordingSize, } = req.body;
        if (!contactPhone || !direction || !status) {
            return res.status(400).json({ error: 'contactPhone, direction e status são obrigatórios' });
        }
        const call = await database_1.default.callHistory.create({
            data: {
                accountId,
                conversationId: conversationId || null,
                contactPhone,
                contactName: contactName || null,
                direction,
                status,
                instanceName: instanceName || null,
                durationSeconds: durationSeconds || null,
                startedAt: startedAt ? new Date(startedAt) : null,
                endedAt: endedAt ? new Date(endedAt) : null,
                recordingPath: recordingPath || null,
                recordingSize: recordingSize || null,
            },
        });
        // Extrai credenciais do request para autenticar na API do Chatwoot
        const jwtRaw = {
            'access-token': req.headers['access-token'],
            'token-type': req.headers['token-type'] || 'Bearer',
            client: req.headers['client'],
            expiry: req.headers['expiry'] || '',
            uid: req.headers['uid'],
        };
        const hasJwt = !!(jwtRaw['access-token'] && jwtRaw.client && jwtRaw.uid);
        const apiAccessToken = req.headers['api_access_token'] || undefined;
        // Usa JWT se disponível, senão api_access_token como fallback
        const jwtForNote = hasJwt ? jwtRaw : undefined;
        const tokenForNote = !hasJwt ? apiAccessToken : undefined;
        // Resolve conversationId — se não veio, tenta buscar pelo telefone
        let resolvedConversationId = conversationId || null;
        if (!resolvedConversationId && contactPhone && (hasJwt || apiAccessToken)) {
            try {
                resolvedConversationId = await chatwoot_1.default.findLatestConversationByPhone(accountId, contactPhone, jwtForNote, tokenForNote);
            }
            catch { /* silencioso */ }
        }
        // Envia nota privada na conversa do Chatwoot
        if (resolvedConversationId && (jwtForNote || tokenForNote)) {
            try {
                const directionLabel = direction === 'OUTGOING' ? '↗ Saída' : '↙ Entrada';
                const durationLabel = durationSeconds && durationSeconds > 0
                    ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`
                    : '—';
                const contactLabel = contactName
                    ? `${contactName} (${contactPhone})`
                    : contactPhone;
                let noteContent;
                if (status === 'ENDED') {
                    noteContent = `📞 *Chamada WhatsApp*\n• Direção: ${directionLabel}\n• Status: ✅ Finalizada\n• Duração: ${durationLabel}\n• Contato: ${contactLabel}`;
                }
                else if (status === 'NOT_ANSWERED') {
                    noteContent = `📵 *Chamada não atendida*\n• Direção: ${directionLabel}\n• Contato: ${contactLabel}\n• Horário: ${startedAt ? new Date(startedAt).toLocaleTimeString('pt-BR') : '—'}`;
                }
                else if (status === 'REJECTED') {
                    noteContent = `❌ *Chamada rejeitada*\n• Direção: ${directionLabel}\n• Contato: ${contactLabel}\n• Horário: ${startedAt ? new Date(startedAt).toLocaleTimeString('pt-BR') : '—'}`;
                }
                else {
                    noteContent = `⚠️ *Chamada WhatsApp*\n• Direção: ${directionLabel}\n• Status: ${status}\n• Contato: ${contactLabel}`;
                }
                await chatwoot_1.default.sendPrivateNote(accountId, resolvedConversationId, noteContent, jwtForNote, tokenForNote);
                logger_1.default.info('Call private note sent', { conversationId: resolvedConversationId, status });
            }
            catch (noteError) {
                logger_1.default.warn('Failed to send call private note', { conversationId: resolvedConversationId, status, error: noteError?.message });
            }
        }
        else if (resolvedConversationId) {
            logger_1.default.warn('Cannot send call private note — no valid auth', { conversationId: resolvedConversationId, status });
        }
        res.json({ data: call });
    }
    catch (error) {
        logger_1.default.error('Failed to save call history', { error: error?.message });
        res.status(500).json({ error: 'Erro ao salvar registro de chamada' });
    }
});
exports.default = router;
//# sourceMappingURL=wavoip.js.map