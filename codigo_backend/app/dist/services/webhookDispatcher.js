"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchWebhook = dispatchWebhook;
const database_1 = __importDefault(require("./database"));
const logger_1 = __importDefault(require("../utils/logger"));
const crypto_1 = __importDefault(require("crypto"));
async function dispatchWebhook(accountId, event, data) {
    try {
        const webhooks = await database_1.default.webhookConfig.findMany({
            where: { accountId, isActive: true },
        });
        const matching = webhooks.filter(w => {
            try {
                const events = JSON.parse(w.events);
                return events.includes(event) || events.includes('*');
            }
            catch {
                return false;
            }
        });
        if (matching.length === 0)
            return;
        const payload = {
            event,
            timestamp: new Date().toISOString(),
            accountId,
            data,
        };
        await Promise.allSettled(matching.map(async (webhook) => {
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'KanbanCW-Webhook/1.0',
                'X-KanbanCW-Event': event,
            };
            if (webhook.secret) {
                const hmac = crypto_1.default.createHmac('sha256', webhook.secret);
                hmac.update(JSON.stringify(payload));
                headers['X-KanbanCW-Signature'] = `sha256=${hmac.digest('hex')}`;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(webhook.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                logger_1.default.info('Webhook dispatched', { webhookId: webhook.id, event, status: response.status });
            }
            catch (err) {
                clearTimeout(timeout);
                logger_1.default.warn('Webhook dispatch failed', { webhookId: webhook.id, event, error: err.message });
            }
        }));
    }
    catch (error) {
        logger_1.default.error('Failed to dispatch webhooks', { accountId, event, error });
    }
}
//# sourceMappingURL=webhookDispatcher.js.map