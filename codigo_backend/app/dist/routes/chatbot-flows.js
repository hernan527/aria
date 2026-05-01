"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const flowQueue_1 = require("../queues/flowQueue");
const chatwootAgentBot_1 = require("../services/chatwootAgentBot");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const checkResourcePermission_1 = require("../middleware/checkResourcePermission");
const globalWebhook_1 = require("../services/globalWebhook");
const router = (0, express_1.Router)();
// Aplica middleware de permissão em todas as rotas de chatbot flows
router.use('/chatbot-flows', (0, checkResourcePermission_1.checkResourcePermission)('chatbotFlowsAccess'));
/**
 * GET /api/chatbot-flows/inboxes
 * Lista todas as inboxes (canais) disponíveis no Chatwoot
 */
router.get('/chatbot-flows/inboxes', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const inboxes = await chatwoot_1.default.getInboxes(account_id, authReq.jwt, authReq.apiToken);
        // NOTA: Agora retornamos TODAS as inboxes sem filtrar
        // Múltiplos flows (chatbot + sequência) podem usar a mesma inbox
        // Formatar para retornar apenas dados necessários
        const formattedInboxes = inboxes.map((inbox) => ({
            id: inbox.id,
            name: inbox.name,
            channel_type: inbox.channel_type,
            avatar_url: inbox.avatar_url,
        }));
        logger_1.default.info('Available inboxes fetched', {
            accountId: account_id,
            total: inboxes.length,
            available: formattedInboxes.length,
        });
        res.json({ data: formattedInboxes });
    }
    catch (error) {
        logger_1.default.error('Error fetching inboxes:', error);
        res.status(500).json({ error: 'Erro ao buscar inboxes' });
    }
});
// GET /api/chatbot-flows/agents - Busca agentes da conta
router.get('/chatbot-flows/agents', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const agents = await chatwoot_1.default.getAccountAgents(account_id, authReq.jwt, authReq.apiToken);
        res.json({ data: agents });
    }
    catch (error) {
        logger_1.default.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Erro ao buscar agentes' });
    }
});
// GET /api/chatbot-flows/teams - Busca times da conta
router.get('/chatbot-flows/teams', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const teams = await chatwoot_1.default.getAccountTeams(account_id, authReq.jwt, authReq.apiToken);
        res.json({ data: teams });
    }
    catch (error) {
        logger_1.default.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Erro ao buscar times' });
    }
});
// GET /api/chatbot-flows/labels - Busca labels da conta
router.get('/chatbot-flows/labels', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const labels = await chatwoot_1.default.getAccountLabels(account_id, authReq.jwt, authReq.apiToken);
        res.json({ data: labels });
    }
    catch (error) {
        logger_1.default.error('Error fetching labels:', error);
        res.status(500).json({ error: 'Erro ao buscar labels' });
    }
});
/**
 * GET /api/chatbot-flows
 * Lista todos os flows da conta
 */
router.get('/chatbot-flows', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flows = await database_1.default.chatbotFlow.findMany({
            where: { accountId: account_id },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { executions: true, sequenceExecutions: true },
                },
            },
        });
        // Parse JSON fields
        const flowsWithParsedData = flows.map((flow) => ({
            ...flow,
            trigger: JSON.parse(flow.trigger),
            flowData: JSON.parse(flow.flowData),
            executionsCount: flow._count.executions + flow._count.sequenceExecutions,
        }));
        res.json({ data: flowsWithParsedData });
    }
    catch (error) {
        logger_1.default.error('Error fetching chatbot flows:', error);
        res.status(500).json({ error: 'Erro ao buscar flows' });
    }
});
/**
 * GET /api/chatbot-flows/:id
 * Busca um flow específico
 */
router.get('/chatbot-flows/:id', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const flow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!flow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        const flowWithParsedData = {
            ...flow,
            trigger: JSON.parse(flow.trigger),
            flowData: JSON.parse(flow.flowData),
        };
        res.json({ data: flowWithParsedData });
    }
    catch (error) {
        logger_1.default.error('Error fetching chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao buscar flow' });
    }
});
/**
 * POST /api/chatbot-flows
 * Cria um novo flow
 */
router.post('/chatbot-flows', async (req, res) => {
    try {
        const authReq = req;
        const { account_id, id: userId } = authReq.user;
        const { name, description, type, trigger, flowData } = req.body;
        // Validações básicas
        if (!name || !trigger) {
            return res.status(400).json({ error: 'Nome e trigger são obrigatórios' });
        }
        if (!['keyword', 'inbox', 'label'].includes(trigger.type)) {
            return res.status(400).json({ error: 'Tipo de trigger inválido' });
        }
        // NOTA: Agora é permitido múltiplos flows (chatbot + sequência) na mesma inbox
        // O webhook global gerencia todos os flows sem conflito
        // FlowData padrão se não fornecido
        const defaultFlowData = {
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 250, y: 50 },
                    data: {},
                },
            ],
            edges: [],
        };
        const flow = await database_1.default.chatbotFlow.create({
            data: {
                name,
                description,
                type: type || 'chatbot',
                accountId: account_id,
                trigger: JSON.stringify(trigger),
                flowData: JSON.stringify(flowData || defaultFlowData),
                createdBy: userId,
                creatorAccessToken: authReq.apiToken, // Salva token do criador se disponível
            },
        });
        // Cria webhook global automaticamente na criação do primeiro flow (qualquer tipo)
        // O webhook será usado para receber eventos de message_created tanto para bots quanto para sequências
        await (0, globalWebhook_1.ensureGlobalWebhook)(account_id, authReq.apiToken, authReq.jwt);
        const flowWithParsedData = {
            ...flow,
            trigger: JSON.parse(flow.trigger),
            flowData: JSON.parse(flow.flowData),
        };
        logger_1.default.info(`Chatbot flow created: ${flow.id} by user ${userId}`);
        res.status(201).json({ data: flowWithParsedData });
    }
    catch (error) {
        logger_1.default.error('Error creating chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao criar flow' });
    }
});
/**
 * PUT /api/chatbot-flows/:id
 * Atualiza um flow existente
 */
router.put('/chatbot-flows/:id', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const updates = req.body;
        // Verifica se o flow existe e pertence à conta
        const existingFlow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!existingFlow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        // NOTA: Agora é permitido múltiplos flows (chatbot + sequência) na mesma inbox
        // O webhook global gerencia todos os flows sem conflito
        // Prepara os dados para atualização
        const updateData = {};
        if (updates.name !== undefined)
            updateData.name = updates.name;
        if (updates.description !== undefined)
            updateData.description = updates.description;
        if (updates.trigger !== undefined)
            updateData.trigger = JSON.stringify(updates.trigger);
        if (updates.flowData !== undefined)
            updateData.flowData = JSON.stringify(updates.flowData);
        if (updates.isActive !== undefined)
            updateData.isActive = updates.isActive;
        const updatedFlow = await database_1.default.chatbotFlow.update({
            where: { id: flowId },
            data: updateData,
        });
        const flowWithParsedData = {
            ...updatedFlow,
            trigger: JSON.parse(updatedFlow.trigger),
            flowData: JSON.parse(updatedFlow.flowData),
        };
        logger_1.default.info(`Chatbot flow updated: ${flowId}`);
        res.json({ data: flowWithParsedData });
    }
    catch (error) {
        logger_1.default.error('Error updating chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao atualizar flow' });
    }
});
/**
 * DELETE /api/chatbot-flows/:id
 * Deleta um flow
 */
router.delete('/chatbot-flows/:id', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const existingFlow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!existingFlow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        // Desassocia e deleta Agent Bot se o flow estava ativo
        if (existingFlow.isActive && existingFlow.agentBotId) {
            const trigger = JSON.parse(existingFlow.trigger);
            await (0, chatwootAgentBot_1.deactivateFlowBot)(flowId, account_id, trigger, existingFlow.agentBotId, authReq.apiToken, authReq.jwt);
        }
        // Cancela todas as execuções em andamento
        await database_1.default.flowExecution.updateMany({
            where: {
                flowId,
                status: { in: ['queued', 'running', 'waiting'] },
            },
            data: {
                status: 'cancelled',
                errorMessage: 'Flow foi deletado',
                completedAt: new Date(),
            },
        });
        // Remove jobs da fila Bull relacionados a este flow
        const { flowQueue } = require('../queues/flowQueue');
        const jobs = await flowQueue.getJobs(['waiting', 'active', 'delayed']);
        const jobsToRemove = jobs.filter((job) => job.data.flowId === flowId);
        for (const job of jobsToRemove) {
            await job.remove();
            logger_1.default.info(`Removed queued job ${job.id} for deleted flow ${flowId}`);
        }
        await database_1.default.chatbotFlow.delete({
            where: { id: flowId },
        });
        logger_1.default.info(`Chatbot flow deleted: ${flowId}, cancelled ${jobsToRemove.length} queued jobs`);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Error deleting chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao deletar flow' });
    }
});
/**
 * PATCH /api/chatbot-flows/:id/activate
 * Ativa ou desativa um flow
 */
router.patch('/chatbot-flows/:id/activate', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive deve ser um booleano' });
        }
        const existingFlow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!existingFlow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        const trigger = JSON.parse(existingFlow.trigger);
        // Gerencia ativação/desativação
        if (isActive) {
            // NOTA: Agora é permitido múltiplos flows (chatbot + sequência) na mesma inbox
            // O webhook global gerencia todos os flows sem conflito
            // NOTA: AgentBot NÃO é mais criado aqui, usamos apenas webhook global
            // O webhook global gerencia tanto flows de chatbot quanto flows de sequência
            // Atualiza flow com isActive (sem botId, pois usamos webhook global)
            const updatedFlow = await database_1.default.chatbotFlow.update({
                where: { id: flowId },
                data: { isActive },
            });
            const flowWithParsedData = {
                ...updatedFlow,
                trigger: JSON.parse(updatedFlow.trigger),
                flowData: JSON.parse(updatedFlow.flowData),
            };
            logger_1.default.info(`Chatbot flow activated: ${flowId}`);
            res.json({ data: flowWithParsedData });
        }
        else {
            // Desativando flow
            // NOTA: AgentBot NÃO é mais usado, então não precisamos desativar nada no Chatwoot
            // O webhook global continua ativo mas o flow só dispara se isActive = true
            // Cancela todas as execuções em andamento
            await database_1.default.flowExecution.updateMany({
                where: {
                    flowId,
                    status: { in: ['queued', 'running', 'waiting'] },
                },
                data: {
                    status: 'cancelled',
                    errorMessage: 'Flow foi desativado',
                    completedAt: new Date(),
                },
            });
            // Remove jobs da fila Bull relacionados a este flow
            const { flowQueue } = require('../queues/flowQueue');
            const jobs = await flowQueue.getJobs(['waiting', 'active', 'delayed']);
            const jobsToRemove = jobs.filter((job) => job.data.flowId === flowId);
            for (const job of jobsToRemove) {
                await job.remove();
                logger_1.default.info(`Removed queued job ${job.id} for deactivated flow ${flowId}`);
            }
            // Atualiza flow com isActive false e remove botId
            const updatedFlow = await database_1.default.chatbotFlow.update({
                where: { id: flowId },
                data: { isActive, agentBotId: null },
            });
            const flowWithParsedData = {
                ...updatedFlow,
                trigger: JSON.parse(updatedFlow.trigger),
                flowData: JSON.parse(updatedFlow.flowData),
            };
            logger_1.default.info(`Chatbot flow deactivated: ${flowId}, cancelled ${jobsToRemove.length} queued jobs`);
            res.json({ data: flowWithParsedData });
        }
    }
    catch (error) {
        logger_1.default.error('Error activating/deactivating chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao ativar/desativar flow' });
    }
});
/**
 * GET /api/chatbot-flows/:id/executions
 * Lista execuções de um flow
 */
router.get('/chatbot-flows/:id/executions', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        // Verifica se o flow existe e pertence à conta
        const flow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!flow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        const executions = await database_1.default.flowExecution.findMany({
            where: { flowId },
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
        });
        // Busca dados das conversas no Chatwoot para pegar número de WhatsApp
        const executionsWithContact = await Promise.all(executions.map(async (execution) => {
            let contactPhone = null;
            let contactName = null;
            try {
                const conversation = await chatwoot_1.default.getConversation(account_id, execution.conversationId, authReq.jwt, authReq.apiToken);
                if (conversation?.meta?.sender) {
                    contactPhone = conversation.meta.sender.phone_number || null;
                    contactName = conversation.meta.sender.name || null;
                }
            }
            catch (error) {
                logger_1.default.warn(`Failed to fetch contact for conversation ${execution.conversationId}:`, error);
            }
            return {
                ...execution,
                context: execution.context ? JSON.parse(execution.context) : null,
                contactPhone,
                contactName,
            };
        }));
        res.json({ data: executionsWithContact });
    }
    catch (error) {
        logger_1.default.error('Error fetching flow executions:', error);
        res.status(500).json({ error: 'Erro ao buscar execuções' });
    }
});
/**
 * POST /api/chatbot-flows/:id/test
 * Testa um flow manualmente
 */
router.post('/chatbot-flows/:id/test', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const { conversationId, testContext } = req.body;
        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId é obrigatório' });
        }
        // Verifica se o flow existe e pertence à conta
        const flow = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!flow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        // Enfileira o flow para execução
        const job = await (0, flowQueue_1.enqueueFlow)(flowId, conversationId, account_id, testContext || {});
        logger_1.default.info(`Chatbot flow test queued: ${flowId} for conversation ${conversationId}`);
        res.json({
            success: true,
            message: 'Flow enfileirado para teste',
            jobId: job.id,
        });
    }
    catch (error) {
        logger_1.default.error('Error testing chatbot flow:', error);
        res.status(500).json({ error: 'Erro ao testar flow' });
    }
});
/**
 * GET /api/chatbot-flows/executions/:id/details
 * Busca detalhes completos de uma execução específica
 */
router.get('/chatbot-flows/executions/:id/details', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const executionId = parseInt(req.params.id);
        const execution = await database_1.default.flowExecution.findFirst({
            where: {
                id: executionId,
                accountId: account_id,
            },
            include: {
                flow: true,
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        // Busca dados completos da conversa no Chatwoot
        let conversation = null;
        let messages = [];
        let contactPhone = null;
        let contactName = null;
        try {
            conversation = await chatwoot_1.default.getConversation(account_id, execution.conversationId, authReq.jwt, authReq.apiToken);
            if (conversation?.meta?.sender) {
                contactPhone = conversation.meta.sender.phone_number || null;
                contactName = conversation.meta.sender.name || null;
            }
            // Busca mensagens da conversa
            messages = await chatwoot_1.default.getConversationMessages(account_id, execution.conversationId, authReq.jwt, authReq.apiToken);
        }
        catch (error) {
            logger_1.default.warn(`Failed to fetch conversation details for execution ${executionId}:`, error);
        }
        // Parse JSON fields
        const executionDetails = {
            ...execution,
            context: execution.context ? JSON.parse(execution.context) : null,
            flow: {
                ...execution.flow,
                trigger: JSON.parse(execution.flow.trigger),
                flowData: JSON.parse(execution.flow.flowData),
            },
            conversation,
            messages,
            contactPhone,
            contactName,
        };
        res.json({ data: executionDetails });
    }
    catch (error) {
        logger_1.default.error('Error fetching execution details:', error);
        res.status(500).json({ error: 'Erro ao buscar detalhes da execução' });
    }
});
/**
 * DELETE /api/chatbot-flows/executions/:id/cancel
 * Cancela uma execução em andamento
 */
router.delete('/chatbot-flows/executions/:id/cancel', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const executionId = parseInt(req.params.id);
        const execution = await database_1.default.flowExecution.findFirst({
            where: {
                id: executionId,
                accountId: account_id,
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
            return res.status(400).json({ error: 'Execução já finalizada' });
        }
        const cancelledExecution = await database_1.default.flowExecution.update({
            where: { id: executionId },
            data: {
                status: 'cancelled',
                completedAt: new Date(),
            },
        });
        logger_1.default.info(`Flow execution cancelled: ${executionId}`);
        res.json({ data: cancelledExecution });
    }
    catch (error) {
        logger_1.default.error('Error cancelling flow execution:', error);
        res.status(500).json({ error: 'Erro ao cancelar execução' });
    }
});
/**
 * POST /api/chatbot-flows/reset-session
 * Reseta sessão de um contato (cancela todas execuções ativas)
 */
router.post('/chatbot-flows/reset-session', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const { conversationId } = req.body;
        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId é obrigatório' });
        }
        // Busca todas as execuções (ativas, waiting e completed) da conversa
        const allExecutions = await database_1.default.flowExecution.findMany({
            where: {
                conversationId: parseInt(conversationId),
                accountId: account_id,
                status: {
                    in: ['queued', 'running', 'waiting', 'completed'],
                },
            },
        });
        if (allExecutions.length === 0) {
            return res.json({
                success: true,
                message: 'Nenhuma execução encontrada para este contato',
                cancelledCount: 0,
            });
        }
        // Cancela TODAS as execuções (incluindo completed) para permitir que o flow reinicie do zero
        const result = await database_1.default.flowExecution.updateMany({
            where: {
                conversationId: parseInt(conversationId),
                accountId: account_id,
                status: {
                    in: ['queued', 'running', 'waiting', 'completed'],
                },
            },
            data: {
                status: 'cancelled',
                completedAt: new Date(),
            },
        });
        logger_1.default.info(`Session reset for conversation ${conversationId}: ${result.count} executions cancelled`);
        res.json({
            success: true,
            message: `${result.count} execução(ões) cancelada(s)`,
            cancelledCount: result.count,
        });
    }
    catch (error) {
        logger_1.default.error('Error resetting session:', error);
        res.status(500).json({ error: 'Erro ao resetar sessão' });
    }
});
/**
 * POST /api/chatbot-flows/:id/add-contact
 * Adiciona um contato a uma sequência (flow do tipo sequence)
 */
router.post('/chatbot-flows/:id/add-contact', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const flowId = parseInt(req.params.id);
        const { contactId, conversationId } = req.body;
        if (!contactId || !conversationId) {
            return res.status(400).json({ error: 'contactId e conversationId são obrigatórios' });
        }
        // Buscar o flow
        const flow = await database_1.default.chatbotFlow.findUnique({
            where: {
                id: flowId,
                accountId: account_id,
            },
        });
        if (!flow) {
            return res.status(404).json({ error: 'Flow não encontrado' });
        }
        if (flow.type !== 'sequence') {
            return res.status(400).json({ error: 'Apenas flows do tipo "sequence" podem ser executados manualmente' });
        }
        if (!flow.isActive) {
            return res.status(400).json({ error: 'Flow está inativo. Ative o flow antes de adicionar contatos.' });
        }
        // Verificar se já existe uma execução ativa para este contato neste flow
        const existingExecution = await database_1.default.sequenceExecution.findFirst({
            where: {
                flowId: flowId,
                contactId: parseInt(contactId),
                accountId: account_id,
                status: {
                    in: ['pending', 'running', 'waiting', 'paused'],
                },
            },
        });
        if (existingExecution) {
            return res.status(400).json({ error: 'Este contato já está nesta sequência' });
        }
        // Usar SequenceExecutor para iniciar a sequência
        const sequenceExecutor = (await Promise.resolve().then(() => __importStar(require('../services/sequenceExecutor')))).default;
        const executionId = await sequenceExecutor.startSequence(flowId, parseInt(contactId), account_id, parseInt(conversationId), {}, authReq.jwt, // Passa JWT do usuário
        authReq.apiToken // Passa API token do usuário
        );
        logger_1.default.info(`Contact ${contactId} added to sequence flow ${flowId}`);
        res.json({
            success: true,
            message: 'Contato adicionado à sequência com sucesso',
            executionId: executionId,
        });
    }
    catch (error) {
        logger_1.default.error('Error adding contact to sequence:', error);
        res.status(500).json({ error: 'Erro ao adicionar contato à sequência' });
    }
});
/**
 * GET /api/chatbot-flows/variables
 * Lista variáveis customizadas
 */
router.get('/chatbot-flows/variables', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const variables = await database_1.default.flowVariable.findMany({
            where: { accountId: account_id },
            orderBy: { name: 'asc' },
        });
        res.json({ data: variables });
    }
    catch (error) {
        logger_1.default.error('Error fetching flow variables:', error);
        res.status(500).json({ error: 'Erro ao buscar variáveis' });
    }
});
/**
 * POST /api/chatbot-flows/variables
 * Cria uma nova variável
 */
router.post('/chatbot-flows/variables', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const { name, defaultValue, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        // Verifica se já existe
        const existing = await database_1.default.flowVariable.findUnique({
            where: {
                accountId_name: {
                    accountId: account_id,
                    name,
                },
            },
        });
        if (existing) {
            return res.status(400).json({ error: 'Variável já existe' });
        }
        const variable = await database_1.default.flowVariable.create({
            data: {
                accountId: account_id,
                name,
                defaultValue,
                description,
            },
        });
        logger_1.default.info(`Flow variable created: ${variable.name}`);
        res.status(201).json({ data: variable });
    }
    catch (error) {
        logger_1.default.error('Error creating flow variable:', error);
        res.status(500).json({ error: 'Erro ao criar variável' });
    }
});
/**
 * PUT /api/chatbot-flows/variables/:id
 * Atualiza uma variável
 */
router.put('/chatbot-flows/variables/:id', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const variableId = parseInt(req.params.id);
        const { defaultValue, description } = req.body;
        const existingVariable = await database_1.default.flowVariable.findFirst({
            where: {
                id: variableId,
                accountId: account_id,
            },
        });
        if (!existingVariable) {
            return res.status(404).json({ error: 'Variável não encontrada' });
        }
        const updatedVariable = await database_1.default.flowVariable.update({
            where: { id: variableId },
            data: {
                defaultValue,
                description,
            },
        });
        logger_1.default.info(`Flow variable updated: ${updatedVariable.name}`);
        res.json({ data: updatedVariable });
    }
    catch (error) {
        logger_1.default.error('Error updating flow variable:', error);
        res.status(500).json({ error: 'Erro ao atualizar variável' });
    }
});
/**
 * DELETE /api/chatbot-flows/variables/:id
 * Deleta uma variável
 */
router.delete('/chatbot-flows/variables/:id', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const variableId = parseInt(req.params.id);
        const existingVariable = await database_1.default.flowVariable.findFirst({
            where: {
                id: variableId,
                accountId: account_id,
            },
        });
        if (!existingVariable) {
            return res.status(404).json({ error: 'Variável não encontrada' });
        }
        await database_1.default.flowVariable.delete({
            where: { id: variableId },
        });
        logger_1.default.info(`Flow variable deleted: ${existingVariable.name}`);
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Error deleting flow variable:', error);
        res.status(500).json({ error: 'Erro ao deletar variável' });
    }
});
/**
 * GET /api/chatbot-flows/inboxes/:id/whatsapp-templates
 * Busca templates de WhatsApp disponíveis para uma inbox específica
 */
router.get('/chatbot-flows/inboxes/:id/whatsapp-templates', async (req, res) => {
    try {
        const authReq = req;
        const { account_id } = authReq.user;
        const inboxId = parseInt(req.params.id);
        const templates = await chatwoot_1.default.getWhatsAppTemplates(account_id, inboxId, authReq.jwt, authReq.apiToken);
        res.json({ data: templates });
    }
    catch (error) {
        logger_1.default.error('Error fetching WhatsApp templates:', error);
        res.status(500).json({ error: 'Erro ao buscar templates do WhatsApp' });
    }
});
exports.default = router;
//# sourceMappingURL=chatbot-flows.js.map