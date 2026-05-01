"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentBotForFlow = createAgentBotForFlow;
exports.associateBotToInbox = associateBotToInbox;
exports.disassociateBotFromInbox = disassociateBotFromInbox;
exports.deleteAgentBot = deleteAgentBot;
exports.activateFlowBot = activateFlowBot;
exports.deactivateFlowBot = deactivateFlowBot;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const database_1 = __importDefault(require("./database"));
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || '';
const KANBANCW_URL = process.env.KANBANCW_URL || '';
/**
 * Cria um Agent Bot específico para um flow
 * Retorna o ID do bot criado
 */
async function createAgentBotForFlow(flowId, flowName, accountId, apiToken, jwt) {
    try {
        const botName = `KanbanCW Flow: ${flowName}`;
        const webhookUrl = `${KANBANCW_URL}/webhooks/chatwoot?flowId=${flowId}`;
        logger_1.default.info('Creating Agent Bot for flow', {
            flowId,
            flowName,
            accountId,
            webhookUrl,
        });
        const headers = buildHeaders(apiToken, jwt);
        const response = await axios_1.default.post(`${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/agent_bots`, {
            name: botName,
            description: `Automação de chatbot - Flow: ${flowName}`,
            outgoing_url: webhookUrl,
        }, { headers });
        const bot = response.data;
        logger_1.default.info('Agent Bot created successfully for flow', {
            flowId,
            flowName,
            accountId,
            botId: bot.id,
            botName: bot.name,
            webhookUrl,
        });
        return bot.id;
    }
    catch (error) {
        logger_1.default.error('Failed to create Agent Bot for flow', {
            flowId,
            flowName,
            accountId,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Verifica se uma inbox existe no Chatwoot
 */
async function inboxExists(accountId, inboxId, apiToken, jwt) {
    try {
        const headers = buildHeaders(apiToken, jwt);
        await axios_1.default.get(`${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}`, { headers });
        return true;
    }
    catch (error) {
        if (error.response?.status === 404) {
            return false;
        }
        throw error;
    }
}
/**
 * Associa o Agent Bot a uma inbox específica
 */
async function associateBotToInbox(botId, accountId, inboxId, apiToken, jwt) {
    try {
        // Verifica se a inbox existe
        const exists = await inboxExists(accountId, inboxId, apiToken, jwt);
        if (!exists) {
            logger_1.default.error('Inbox not found in Chatwoot', {
                accountId,
                inboxId,
                botId,
            });
            throw new Error(`Inbox ${inboxId} not found in Chatwoot. Please verify the inbox ID.`);
        }
        // Associa bot à inbox
        const headers = buildHeaders(apiToken, jwt);
        await axios_1.default.post(`${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}/set_agent_bot`, {
            agent_bot: botId,
        }, { headers });
        logger_1.default.info('Agent Bot associated to inbox', {
            accountId,
            inboxId,
            botId,
        });
    }
    catch (error) {
        logger_1.default.error('Failed to associate Agent Bot to inbox', {
            accountId,
            inboxId,
            botId,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Remove a associação do Agent Bot de uma inbox
 */
async function disassociateBotFromInbox(accountId, inboxId, apiToken, jwt) {
    try {
        // Verifica se a inbox existe
        const exists = await inboxExists(accountId, inboxId, apiToken, jwt);
        if (!exists) {
            logger_1.default.warn('Inbox not found, skipping disassociation', {
                accountId,
                inboxId,
            });
            return;
        }
        // Remove associação
        const headers = buildHeaders(apiToken, jwt);
        await axios_1.default.post(`${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/inboxes/${inboxId}/set_agent_bot`, {
            agent_bot: null,
        }, { headers });
        logger_1.default.info('Agent Bot disassociated from inbox', {
            accountId,
            inboxId,
        });
    }
    catch (error) {
        logger_1.default.error('Failed to disassociate Agent Bot from inbox', {
            accountId,
            inboxId,
            error: error.message,
            response: error.response?.data,
        });
        // Não lança erro - apenas loga
    }
}
/**
 * Deleta um Agent Bot do Chatwoot
 */
async function deleteAgentBot(botId, accountId, apiToken, jwt) {
    try {
        const headers = buildHeaders(apiToken, jwt);
        await axios_1.default.delete(`${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/agent_bots/${botId}`, { headers });
        logger_1.default.info('Agent Bot deleted', {
            accountId,
            botId,
        });
    }
    catch (error) {
        logger_1.default.error('Failed to delete Agent Bot', {
            accountId,
            botId,
            error: error.message,
            response: error.response?.data,
        });
        // Não lança erro - apenas loga
    }
}
/**
 * Constrói headers de autenticação para API do Chatwoot
 */
function buildHeaders(apiToken, jwt) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (apiToken) {
        headers['api_access_token'] = apiToken;
    }
    else if (jwt) {
        // Usa headers JWT se disponível
        headers['access-token'] = jwt['access-token'];
        headers['token-type'] = jwt['token-type'];
        headers['client'] = jwt.client;
        headers['expiry'] = jwt.expiry;
        headers['uid'] = jwt.uid;
    }
    return headers;
}
/**
 * Gerencia o Agent Bot ao ativar um flow
 * Cria o bot e associa à inbox
 */
async function activateFlowBot(flowId, flowName, accountId, trigger, apiToken, jwt) {
    // Só processa se for trigger de inbox
    if (trigger.type !== 'inbox') {
        return null;
    }
    const inboxId = Number(trigger.value);
    if (isNaN(inboxId)) {
        logger_1.default.warn('Invalid inbox ID in trigger', { trigger });
        return null;
    }
    try {
        // Cria Agent Bot para este flow
        const botId = await createAgentBotForFlow(flowId, flowName, accountId, apiToken, jwt);
        // Associa bot à inbox
        await associateBotToInbox(botId, accountId, inboxId, apiToken, jwt);
        // Atualiza flow com o botId
        await database_1.default.chatbotFlow.update({
            where: { id: flowId },
            data: { agentBotId: botId },
        });
        return botId;
    }
    catch (error) {
        logger_1.default.error('Failed to activate flow bot', {
            flowId,
            accountId,
            inboxId,
            error: error.message,
        });
        throw error;
    }
}
/**
 * Gerencia o Agent Bot ao desativar um flow
 * Remove associação da inbox e deleta o bot
 */
async function deactivateFlowBot(flowId, accountId, trigger, agentBotId, apiToken, jwt) {
    // Só processa se for trigger de inbox e tiver botId
    if (trigger.type !== 'inbox' || !agentBotId) {
        return;
    }
    const inboxId = Number(trigger.value);
    if (isNaN(inboxId)) {
        logger_1.default.warn('Invalid inbox ID in trigger', { trigger });
        return;
    }
    try {
        // Remove associação da inbox
        await disassociateBotFromInbox(accountId, inboxId, apiToken, jwt);
        // Deleta o Agent Bot
        await deleteAgentBot(agentBotId, accountId, apiToken, jwt);
        // Remove botId do flow
        await database_1.default.chatbotFlow.update({
            where: { id: flowId },
            data: { agentBotId: null },
        });
    }
    catch (error) {
        logger_1.default.error('Failed to deactivate flow bot', {
            flowId,
            accountId,
            inboxId,
            agentBotId,
            error: error.message,
        });
        // Não lança erro - continua mesmo se falhar
    }
}
//# sourceMappingURL=chatwootAgentBot.js.map