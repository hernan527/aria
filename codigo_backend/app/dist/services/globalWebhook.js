"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGlobalWebhook = ensureGlobalWebhook;
exports.removeGlobalWebhook = removeGlobalWebhook;
const chatwoot_1 = __importDefault(require("./chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const database_1 = __importDefault(require("./database"));
/**
 * Cria webhook global no Chatwoot (se não existir)
 * Chamado automaticamente ao criar o primeiro flow
 */
async function ensureGlobalWebhook(accountId, apiToken, jwt) {
    try {
        // Verifica se já existe webhook global configurado
        const settings = await database_1.default.systemSettings.findUnique({
            where: { accountId },
        });
        if (settings?.chatwootGlobalWebhookId) {
            logger_1.default.info('Global webhook already exists', {
                accountId,
                webhookId: settings.chatwootGlobalWebhookId,
            });
            return settings.chatwootGlobalWebhookId;
        }
        // Cria webhook global via API do Chatwoot
        const webhookUrl = `${process.env.KANBANCW_URL || process.env.VITE_API_URL}/webhooks/chatwoot`;
        logger_1.default.info('Creating global webhook', {
            accountId,
            webhookUrl,
            hasApiToken: !!apiToken,
            hasJWT: !!jwt,
            KANBANCW_URL: process.env.KANBANCW_URL,
            VITE_API_URL: process.env.VITE_API_URL,
        });
        const response = await chatwoot_1.default.createWebhook(accountId, webhookUrl, ['message_created'], // Apenas mensagens
        jwt, apiToken);
        logger_1.default.info('Webhook creation response received', {
            accountId,
            responseKeys: Object.keys(response || {}),
            hasId: !!response?.id,
            responseData: response,
        });
        const webhookId = response.id?.toString();
        if (!webhookId) {
            logger_1.default.error('Failed to get webhook ID from response', { response });
            return null;
        }
        // Salva o webhookId nas configurações
        await database_1.default.systemSettings.upsert({
            where: { accountId },
            create: {
                accountId,
                chatwootGlobalWebhookId: webhookId,
            },
            update: {
                chatwootGlobalWebhookId: webhookId,
            },
        });
        logger_1.default.info('Global webhook created successfully', {
            accountId,
            webhookId,
            url: webhookUrl,
        });
        return webhookId;
    }
    catch (error) {
        logger_1.default.error('Failed to create global webhook', {
            accountId,
            error: error instanceof Error ? error.message : error,
            errorStack: error instanceof Error ? error.stack : undefined,
            errorResponse: error?.response?.data,
            errorStatus: error?.response?.status,
            errorStatusText: error?.response?.statusText,
        });
        // Não falha a criação do flow se webhook falhar
        return null;
    }
}
/**
 * Remove webhook global do Chatwoot
 */
async function removeGlobalWebhook(accountId, apiToken, jwt) {
    try {
        const settings = await database_1.default.systemSettings.findUnique({
            where: { accountId },
        });
        if (!settings?.chatwootGlobalWebhookId) {
            logger_1.default.info('No global webhook to remove', { accountId });
            return;
        }
        logger_1.default.info('Removing global webhook', {
            accountId,
            webhookId: settings.chatwootGlobalWebhookId,
        });
        await chatwoot_1.default.deleteWebhook(accountId, settings.chatwootGlobalWebhookId, jwt, apiToken);
        // Remove da configuração
        await database_1.default.systemSettings.update({
            where: { accountId },
            data: { chatwootGlobalWebhookId: null },
        });
        logger_1.default.info('Global webhook removed successfully', { accountId });
    }
    catch (error) {
        logger_1.default.error('Failed to remove global webhook', {
            accountId,
            error: error instanceof Error ? error.message : error,
        });
    }
}
//# sourceMappingURL=globalWebhook.js.map