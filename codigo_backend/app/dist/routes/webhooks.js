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
exports.setSocketIO = setSocketIO;
const express_1 = require("express");
const logger_1 = __importDefault(require("../utils/logger"));
const database_1 = __importDefault(require("../services/database"));
const flowQueue_1 = require("../queues/flowQueue");
const cwapp_push_1 = require("./cwapp-push");
const router = (0, express_1.Router)();
let io = null;
function setSocketIO(socketIO) {
    io = socketIO;
}
// POST /webhooks/chatwoot - Recebe webhooks do Chatwoot
router.post('/chatwoot', async (req, res) => {
    const payload = req.body;
    const flowId = req.query.flowId ? parseInt(req.query.flowId) : null;
    logger_1.default.info('Webhook received', {
        event: payload.event,
        accountId: payload.account?.id,
        conversationId: payload.conversation?.id,
        flowId
    });
    // Log completo do payload para debug
    logger_1.default.info('Webhook payload structure', {
        hasEvent: !!payload.event,
        hasMessage: !!payload.message,
        hasConversation: !!payload.conversation,
        hasAccount: !!payload.account,
        eventValue: payload.event,
        payloadKeys: Object.keys(payload)
    });
    // Responde imediatamente para o Chatwoot
    res.json({ success: true });
    // Processa webhooks de forma assíncrona
    try {
        // === CHATBOT FLOW TRIGGERS ===
        // Agent Bot webhooks enviam os dados diretamente no payload, sem nested "message"
        if (payload.event === 'message_created' && payload.conversation && payload.account) {
            // Compatibilidade: Agent Bot envia dados direto no payload, webhooks normais enviam em "message"
            const message = payload.message || payload;
            const { conversation, account } = payload;
            logger_1.default.info('message_created event detected', {
                messageType: message.message_type,
                isPrivate: message.private,
                hasFlowId: !!flowId,
                isAgentBotWebhook: !payload.message
            });
            // Apenas mensagens incoming (do cliente)
            if (message.message_type === 'incoming' && !message.private) {
                logger_1.default.info('Processing incoming message', {
                    accountId: account.id,
                    conversationId: conversation.id,
                    flowId
                });
                // Envia push notification para o agente responsável
                try {
                    const assigneeId = conversation.meta?.assignee?.id || null;
                    const senderName = message.sender?.name || 'Cliente';
                    const preview = (message.content || '').substring(0, 120) || '(nova mensagem)';
                    await (0, cwapp_push_1.sendPushToAccount)(account.id, assigneeId, {
                        title: senderName,
                        body: preview,
                        url: `/conversations/${conversation.id}`,
                    });
                }
                catch (pushErr) {
                    logger_1.default.warn('Push notification failed (non-critical):', pushErr);
                }
                const accountId = account.id;
                const conversationId = conversation.id;
                // === AUTOMAÇÃO: newTicket — cria card na etapa configurada ===
                // Roda para TODA mensagem incoming; a função verifica se já existe card
                // (evita duplicatas) e só age se a inbox corresponde a uma etapa configurada.
                try {
                    await createCardByNewTicketAutomation(accountId, conversationId, conversation.inbox_id);
                }
                catch (newTicketErr) {
                    logger_1.default.warn('Erro na automação newTicket (message_created)', { error: newTicketErr });
                }
                // Verifica se há execução pausada aguardando resposta (waitForResponse)
                const waitingExecution = await database_1.default.flowExecution.findFirst({
                    where: {
                        accountId,
                        conversationId,
                        status: 'waiting',
                    },
                    orderBy: { startedAt: 'desc' },
                });
                // Verifica se há sequência pausada aguardando resposta
                const waitingSequence = await database_1.default.sequenceExecution.findFirst({
                    where: {
                        accountId,
                        conversationId,
                        status: 'waiting',
                    },
                    orderBy: { startedAt: 'desc' },
                });
                logger_1.default.info('Waiting execution check', {
                    found: !!waitingExecution,
                    foundSequence: !!waitingSequence,
                    flowId
                });
                if (waitingSequence) {
                    // Retoma sequência com a resposta do usuário
                    logger_1.default.info(`Resuming sequence execution ${waitingSequence.id} with user response`);
                    const sequenceExecutor = (await Promise.resolve().then(() => __importStar(require('../services/sequenceExecutor')))).default;
                    await sequenceExecutor.resumeExecution(waitingSequence.id, { response: message.content });
                }
                else if (waitingExecution) {
                    // Retoma execução com a resposta do usuário
                    logger_1.default.info(`Resuming flow execution ${waitingExecution.id} with user response`);
                    await (0, flowQueue_1.resumeFlow)(waitingExecution.id, waitingExecution.flowId, conversationId, accountId, {
                        response: message.content,
                        _resumeExecutionId: waitingExecution.id,
                    });
                }
                else {
                    // Verifica se há execução ativa (queued ou running) - evita reiniciar o bot
                    const activeExecution = await database_1.default.flowExecution.findFirst({
                        where: {
                            accountId,
                            conversationId,
                            status: {
                                in: ['queued', 'running'],
                            },
                        },
                        orderBy: { startedAt: 'desc' },
                    });
                    if (activeExecution) {
                        // Verifica se é uma sequência com "parar ao responder" ativado
                        const flow = await database_1.default.chatbotFlow.findUnique({
                            where: { id: activeExecution.flowId },
                        });
                        if (flow && flow.type === 'sequence') {
                            const flowData = JSON.parse(flow.flowData);
                            const startNode = flowData.nodes?.find((node) => node.type === 'start');
                            if (startNode?.data?.stopOnUserReply) {
                                logger_1.default.info(`User replied during sequence ${flow.id} with stopOnUserReply enabled, cancelling execution ${activeExecution.id}`);
                                // Cancela a execução
                                await database_1.default.flowExecution.update({
                                    where: { id: activeExecution.id },
                                    data: {
                                        status: 'cancelled',
                                        errorMessage: 'Usuário respondeu durante a sequência',
                                        completedAt: new Date(),
                                    },
                                });
                                // Remove jobs da fila relacionados a esta execução
                                const jobs = await flowQueue_1.flowQueue.getJobs(['waiting', 'active', 'delayed']);
                                const jobsToRemove = jobs.filter((job) => job.data.executionId === activeExecution.id);
                                for (const job of jobsToRemove) {
                                    await job.remove();
                                    logger_1.default.info(`Removed job ${job.id} for cancelled execution ${activeExecution.id}`);
                                }
                                logger_1.default.info(`Sequence execution ${activeExecution.id} cancelled due to user reply`);
                                return; // Para o processamento aqui
                            }
                            else {
                                // Marca que o usuário respondeu no contexto da execução (para checkResponse node)
                                const currentContext = JSON.parse(activeExecution.context || '{}');
                                await database_1.default.flowExecution.update({
                                    where: { id: activeExecution.id },
                                    data: {
                                        context: JSON.stringify({
                                            ...currentContext,
                                            userReplied: true,
                                            userReplyMessage: message.content,
                                        }),
                                    },
                                });
                                logger_1.default.info(`Marked user reply in execution ${activeExecution.id} context`);
                            }
                        }
                        logger_1.default.info(`Flow execution ${activeExecution.id} is already active (status: ${activeExecution.status}), ignoring new message to prevent restart`);
                        return; // Ignora a mensagem para não reiniciar o flow
                    }
                    // Verifica se já existe execução completa (com node end) para evitar repetir mensagens
                    const completedExecution = await database_1.default.flowExecution.findFirst({
                        where: {
                            accountId,
                            conversationId,
                            status: 'completed',
                        },
                        orderBy: { completedAt: 'desc' },
                    });
                    // Se existe execução completada, verifica se o flow contém AI Agent
                    if (completedExecution && flowId && completedExecution.flowId === flowId) {
                        // Busca o flow para verificar se contém AI Agent
                        const flow = await database_1.default.chatbotFlow.findUnique({
                            where: { id: flowId },
                        });
                        if (flow) {
                            const flowData = JSON.parse(flow.flowData);
                            const hasAIAgent = flowData.nodes?.some((node) => node.type === 'aiAgent');
                            // Se o flow contém AI Agent, permite re-execução para manter conversação
                            if (hasAIAgent) {
                                logger_1.default.info(`Flow ${flowId} contains AI Agent, allowing re-execution for conversation ${conversationId}`);
                            }
                            else {
                                logger_1.default.info(`Flow ${flowId} already completed for conversation ${conversationId}, skipping re-execution`);
                                return; // Não executa novamente
                            }
                        }
                    }
                    // Se flowId foi fornecido na URL (via Agent Bot), processa apenas esse flow
                    if (flowId) {
                        logger_1.default.info(`Agent Bot webhook: looking for flow ${flowId} for account ${accountId}`);
                        const flow = await database_1.default.chatbotFlow.findFirst({
                            where: {
                                id: flowId,
                                accountId,
                                isActive: true,
                            },
                        });
                        logger_1.default.info(`Flow query result:`, {
                            flowId,
                            accountId,
                            found: !!flow,
                            flowData: flow ? { id: flow.id, name: flow.name, isActive: flow.isActive } : null
                        });
                        if (flow) {
                            // Verifica se a conversa já está atribuída a um agente
                            const isAssigned = conversation.meta?.assignee;
                            if (isAssigned) {
                                logger_1.default.info(`Skipping flow ${flow.id} - conversation ${conversationId} is already assigned to an agent`);
                            }
                            else {
                                logger_1.default.info(`Triggering flow ${flow.id} (${flow.name}) via Agent Bot for conversation ${conversationId}`);
                                try {
                                    // Enfileira flow
                                    await (0, flowQueue_1.enqueueFlow)(flow.id, conversationId, accountId, {
                                        message: message.content,
                                        senderName: message.sender?.name,
                                        contactEmail: message.sender?.email,
                                        inboxId: conversation.inbox_id,
                                    });
                                    logger_1.default.info(`Flow ${flow.id} successfully enqueued for conversation ${conversationId}`);
                                }
                                catch (error) {
                                    logger_1.default.error(`Failed to enqueue flow ${flow.id}:`, error);
                                }
                            }
                        }
                        else {
                            logger_1.default.warn(`Flow ${flowId} not found or inactive for account ${accountId}`);
                        }
                    }
                    else {
                        // Fallback: busca flows ativos que correspondem aos triggers (backwards compatibility)
                        // IMPORTANTE: Apenas flows de chatbot são disparados automaticamente
                        // Flows de sequência só devem ser disparados manualmente
                        const activeFlows = await database_1.default.chatbotFlow.findMany({
                            where: {
                                accountId,
                                isActive: true,
                                type: 'chatbot', // Exclui flows de sequência do disparo automático
                            },
                        });
                        // Verifica se a conversa já está atribuída a um agente
                        const isAssigned = conversation.meta?.assignee;
                        if (isAssigned) {
                            logger_1.default.info(`Skipping flows - conversation ${conversationId} is already assigned to an agent`);
                        }
                        else {
                            for (const flow of activeFlows) {
                                const trigger = JSON.parse(flow.trigger);
                                const flowData = JSON.parse(flow.flowData);
                                if (shouldTriggerFlow(trigger, flowData, message, conversation)) {
                                    logger_1.default.info(`Triggering flow ${flow.id} (${flow.name}) for conversation ${conversationId}`);
                                    // Enfileira flow
                                    await (0, flowQueue_1.enqueueFlow)(flow.id, conversationId, accountId, {
                                        message: message.content,
                                        senderName: message.sender?.name,
                                        contactEmail: message.sender?.email,
                                        inboxId: conversation.inbox_id,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        // === CONVERSATION_CREATED (webhook normal do Chatwoot) ===
        // Complementa o handler de message_created para casos onde o evento chega
        // antes da primeira mensagem (webhooks regulares, não apenas Agent Bot).
        if (payload.event === 'conversation_created' && payload.conversation && payload.account) {
            try {
                await createCardByNewTicketAutomation(payload.account.id, payload.conversation.id, payload.conversation.inbox_id);
            }
            catch (err) {
                logger_1.default.warn('Erro na automação newTicket (conversation_created)', { error: err });
            }
        }
        // === SOCKET.IO EVENTS ===
        // Emite evento via Socket.IO para atualizar o frontend
        if (io && payload.conversation) {
            const eventData = {
                event: payload.event,
                conversation: {
                    id: payload.conversation.id,
                    status: payload.conversation.status,
                    unread_count: payload.conversation.unread_count,
                    updated_at: payload.conversation.updated_at
                }
            };
            io.emit('conversation_update', eventData);
            logger_1.default.info('Socket event emitted', { event: 'conversation_update' });
        }
    }
    catch (error) {
        logger_1.default.error('Error processing webhook:', error);
    }
});
/**
 * Verifica se o flow deve ser disparado baseado no trigger e na regra de início
 */
function shouldTriggerFlow(trigger, flowData, message, conversation) {
    // Primeiro verifica se o trigger do flow corresponde (inbox ou label)
    let triggerMatches = false;
    switch (trigger.type) {
        case 'inbox':
            // Verifica se a conversa pertence a uma inbox específica
            triggerMatches = conversation.inbox_id === Number(trigger.value);
            break;
        case 'label':
            // Verifica se a conversa possui uma label específica
            const labels = conversation.labels || [];
            triggerMatches = labels.some((label) => label === trigger.value);
            break;
        case 'keyword':
            // Backwards compatibility: se trigger é keyword, verifica diretamente
            const keyword = String(trigger.value).toLowerCase();
            const content = (message.content || '').toLowerCase();
            return content.includes(keyword);
        default:
            logger_1.default.warn(`Unknown trigger type: ${trigger.type}`);
            return false;
    }
    // Se o trigger não corresponde, não dispara
    if (!triggerMatches) {
        return false;
    }
    // Agora verifica a regra de início (startRule) do primeiro node
    const startNode = flowData.nodes.find((node) => node.type === 'start');
    logger_1.default.info('Checking startRule', {
        hasStartNode: !!startNode,
        startNodeData: startNode?.data,
        startRule: startNode?.data?.startRule
    });
    if (!startNode || !startNode.data.startRule) {
        // Se não tem startRule, dispara para qualquer mensagem (apenas pelo trigger)
        logger_1.default.info('No startRule defined, triggering flow');
        return true;
    }
    // Verifica se a mensagem contém alguma das palavras-chave do startRule
    const startRule = String(startNode.data.startRule).toLowerCase();
    const messageContent = (message.content || '').toLowerCase();
    // Suporta múltiplas palavras separadas por vírgula
    const keywords = startRule.split(',').map((k) => k.trim());
    const matches = keywords.some((keyword) => messageContent.includes(keyword));
    logger_1.default.info('StartRule check result', {
        startRule,
        messageContent,
        keywords,
        matches
    });
    return matches;
}
/**
 * Verifica se deve criar card automaticamente na etapa configurada com "newTicket".
 * Chamado tanto em conversation_created quanto em message_created (primeira mensagem).
 * Não cria duplicata graças à constraint @@unique([conversationId, accountId]).
 */
async function createCardByNewTicketAutomation(accountId, conversationId, inboxId) {
    // Se já existe card para esta conversa, nada a fazer
    const existingCard = await database_1.default.card.findFirst({
        where: { conversationId, accountId },
    });
    if (existingCard)
        return;
    // Busca todas as etapas de funis ativos da conta
    const stages = await database_1.default.stage.findMany({
        where: { funnel: { accountId, isActive: true } },
        include: { funnel: { select: { id: true, name: true } } },
        orderBy: { order: 'asc' },
    });
    for (const stage of stages) {
        if (!stage.automations)
            continue;
        let automation;
        try {
            automation = JSON.parse(stage.automations);
        }
        catch {
            continue;
        }
        if (!automation.newTicket)
            continue;
        // Filtra por inboxIds se configurado
        if (Array.isArray(automation.inboxIds) && automation.inboxIds.length > 0) {
            if (!automation.inboxIds.includes(inboxId))
                continue;
        }
        try {
            await database_1.default.card.create({
                data: { conversationId, stageId: stage.id, accountId },
            });
            logger_1.default.info('Card criado pela automação newTicket', {
                conversationId,
                stageId: stage.id,
                funnelId: stage.funnelId,
                funnelName: stage.funnel.name,
                accountId,
                inboxId,
            });
        }
        catch (createErr) {
            // Unique constraint = card já foi criado em outra chamada concorrente, ignora
            if (createErr.code === 'P2002')
                return;
            throw createErr;
        }
        // Primeira etapa correspondente vence — para aqui
        break;
    }
}
exports.default = router;
//# sourceMappingURL=webhooks.js.map