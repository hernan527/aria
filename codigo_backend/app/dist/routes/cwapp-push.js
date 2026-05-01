"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebPush = initWebPush;
exports.sendPushToAccount = sendPushToAccount;
const express_1 = require("express");
const web_push_1 = __importDefault(require("web-push"));
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Configura VAPID (chamado uma vez no startup via initWebPush)
function initWebPush() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || 'mailto:admin@cwapp.app';
    if (pub && priv) {
        web_push_1.default.setVapidDetails(email, pub, priv);
        logger_1.default.info('Web Push VAPID configurado');
    }
    else {
        logger_1.default.warn('VAPID keys não configuradas — push notifications desabilitadas');
    }
}
// GET /api/cwapp/push/vapid-public-key — retorna a chave pública para o frontend assinar
router.get('/vapid-public-key', (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key)
        return res.status(503).json({ error: 'Push não configurado' });
    res.json({ publicKey: key });
});
// POST /api/cwapp/push/subscribe — salva subscription do browser
router.post('/subscribe', async (req, res) => {
    const authReq = req;
    const userId = authReq.userId;
    const accountId = authReq.accountId;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Subscription inválida' });
    }
    try {
        await database_1.default.pushSubscription.upsert({
            where: { endpoint },
            create: { userId, accountId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
            update: { userId, accountId, p256dh: keys.p256dh, auth: keys.auth },
        });
        logger_1.default.info('Push subscription salva', { userId, accountId });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao salvar push subscription', { error: error.message });
        res.status(500).json({ error: 'Erro interno' });
    }
});
// DELETE /api/cwapp/push/subscribe — remove subscription
router.delete('/subscribe', async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint)
        return res.status(400).json({ error: 'endpoint obrigatório' });
    try {
        await database_1.default.pushSubscription.deleteMany({ where: { endpoint } });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Erro interno' });
    }
});
/**
 * Envia push notification para todos os subscribers de um agente.
 * Chamado pelo webhook handler quando chega message_created.
 */
async function sendPushToAccount(accountId, assigneeId, payload) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    if (!pub)
        return;
    try {
        // Busca subscriptions: do agente atribuído ou de todos da conta se sem agente
        const where = assigneeId
            ? { accountId, userId: assigneeId }
            : { accountId };
        const subs = await database_1.default.pushSubscription.findMany({ where });
        if (!subs.length)
            return;
        const pushPayload = JSON.stringify(payload);
        await Promise.allSettled(subs.map(async (sub) => {
            try {
                await web_push_1.default.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, pushPayload);
            }
            catch (err) {
                // Remove subscription expirada (410 Gone)
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await database_1.default.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
                    logger_1.default.info('Push subscription expirada removida', { endpoint: sub.endpoint });
                }
            }
        }));
        logger_1.default.info('Push notifications enviadas', { accountId, count: subs.length });
    }
    catch (error) {
        logger_1.default.error('Erro ao enviar push', { error: error.message });
    }
}
exports.default = router;
//# sourceMappingURL=cwapp-push.js.map