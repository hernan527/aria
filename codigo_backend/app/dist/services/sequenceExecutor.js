"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceExecutor = void 0;
exports.setSequenceExecutorSocketIO = setSequenceExecutorSocketIO;
const database_1 = __importDefault(require("./database"));
const chatwoot_1 = __importDefault(require("./chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const encryption_1 = require("../utils/encryption");
let io = null;
function setSequenceExecutorSocketIO(socketIO) {
    io = socketIO;
}
/**
 * Executor de sequências assíncronas
 * Processa flows do tipo "sequence" ao longo do tempo
 */
class SequenceExecutor {
    botToken;
    constructor() {
        this.botToken = process.env.CHATWOOT_BOT_TOKEN;
        if (!this.botToken) {
            logger_1.default.warn('CHATWOOT_BOT_TOKEN not configured for sequences');
        }
    }
    /**
     * Inicia uma nova sequência para um contato
     */
    async startSequence(flowId, contactId, accountId, conversationId, initialContext = {}, jwt, apiToken) {
        try {
            // Busca o flow
            const flow = await database_1.default.chatbotFlow.findFirst({
                where: {
                    id: flowId,
                    accountId,
                    type: 'sequence',
                },
            });
            if (!flow) {
                throw new Error(`Sequência ${flowId} não encontrada`);
            }
            if (!flow.isActive) {
                throw new Error(`Sequência ${flowId} está inativa`);
            }
            // Verifica se contato já está nesta sequência
            const existingExecution = await database_1.default.sequenceExecution.findFirst({
                where: {
                    flowId,
                    contactId,
                    accountId,
                    status: { in: ['pending', 'running', 'waiting', 'paused'] },
                },
            });
            if (existingExecution) {
                throw new Error(`Contato ${contactId} já está na sequência ${flowId}`);
            }
            // Cria execução com credenciais do usuário
            const execution = await database_1.default.sequenceExecution.create({
                data: {
                    flowId,
                    contactId,
                    accountId,
                    conversationId,
                    status: 'pending',
                    context: JSON.stringify(initialContext),
                    // Salva credenciais criptografadas para enviar mensagens
                    apiToken: (0, encryption_1.encryptOptional)(apiToken),
                    jwtAccessToken: (0, encryption_1.encryptOptional)(jwt?.['access-token']),
                    jwtClient: (0, encryption_1.encryptOptional)(jwt?.client),
                    jwtUid: (0, encryption_1.encryptOptional)(jwt?.uid),
                    jwtExpiry: (0, encryption_1.encryptOptional)(jwt?.expiry),
                    jwtTokenType: (0, encryption_1.encryptOptional)(jwt?.['token-type']),
                },
            });
            logger_1.default.info(`Sequência ${flowId} iniciada para contato ${contactId}`, {
                executionId: execution.id,
            });
            // Emite evento via Socket.IO
            io?.to(`account_${accountId}`).emit('sequence:started', {
                executionId: execution.id,
                flowId,
                contactId,
                conversationId,
            });
            // Executa primeiro step
            await this.processExecution(execution.id);
            return execution.id;
        }
        catch (error) {
            logger_1.default.error('Erro ao iniciar sequência:', error);
            throw error;
        }
    }
    /**
     * Processa uma execução específica
     * Executa o próximo node da sequência
     */
    async processExecution(executionId) {
        const execution = await database_1.default.sequenceExecution.findUnique({
            where: { id: executionId },
            include: { flow: true },
        });
        if (!execution) {
            throw new Error(`Execução ${executionId} não encontrada`);
        }
        if (execution.status === 'completed' || execution.status === 'canceled') {
            logger_1.default.warn(`Execução ${executionId} já finalizada`);
            return;
        }
        try {
            // Atualiza status para running
            await database_1.default.sequenceExecution.update({
                where: { id: executionId },
                data: { status: 'running' },
            });
            const flowData = JSON.parse(execution.flow.flowData);
            const { nodes, edges } = flowData;
            const context = JSON.parse(execution.context || '{}');
            // Determina próximo node
            let currentNodeId = execution.currentNodeId;
            if (!currentNodeId) {
                // Primeiro node: encontra o start
                const startNode = nodes.find((n) => n.type === 'start');
                if (!startNode) {
                    throw new Error('Sequência não possui node Start');
                }
                currentNodeId = startNode.id;
            }
            // Busca próximo node baseado nas edges
            const nextNode = currentNodeId ? this.findNextNode(currentNodeId, nodes, edges, context) : null;
            if (!nextNode) {
                // Fim da sequência
                await this.completeSequence(executionId);
                return;
            }
            logger_1.default.info(`Processando node ${nextNode.id} (${nextNode.type}) da execução ${executionId}`);
            // Executa o node
            const result = await this.executeNode(execution, nextNode, context);
            // Verifica se o node pausou a execução (waitForResponse)
            const updatedExecution = await database_1.default.sequenceExecution.findUnique({
                where: { id: executionId },
            });
            if (updatedExecution?.status === 'waiting') {
                logger_1.default.info(`Execução ${executionId} foi pausada pelo node ${nextNode.type}, não continuará automaticamente`);
                return;
            }
            // Atualiza contexto
            const updatedContext = { ...context, ...result.context };
            if (result.delay) {
                // Agendar próximo step
                const scheduledFor = new Date(Date.now() + result.delay);
                await database_1.default.sequenceStep.create({
                    data: {
                        executionId,
                        nodeId: nextNode.id,
                        nodeType: nextNode.type,
                        status: 'scheduled',
                        scheduledFor,
                        data: JSON.stringify(nextNode.data),
                    },
                });
                await database_1.default.sequenceExecution.update({
                    where: { id: executionId },
                    data: {
                        status: 'waiting',
                        currentNodeId: nextNode.id,
                        context: JSON.stringify(updatedContext),
                    },
                });
                logger_1.default.info(`Próximo step agendado para ${scheduledFor.toISOString()}`);
            }
            else {
                // Continua para próximo node imediatamente
                await database_1.default.sequenceExecution.update({
                    where: { id: executionId },
                    data: {
                        currentNodeId: nextNode.id,
                        context: JSON.stringify(updatedContext),
                    },
                });
                // Executa próximo node recursivamente
                await this.processExecution(executionId);
            }
        }
        catch (error) {
            logger_1.default.error(`Erro ao processar execução ${executionId}:`, error);
            await database_1.default.sequenceExecution.update({
                where: { id: executionId },
                data: {
                    status: 'failed',
                    errorMessage: error instanceof Error ? error.message : String(error),
                },
            });
            io?.to(`account_${execution.accountId}`).emit('sequence:failed', {
                executionId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Executa um node específico
     */
    async executeNode(execution, node, context) {
        const { type, data } = node;
        // Cria step no banco
        const step = await database_1.default.sequenceStep.create({
            data: {
                executionId: execution.id,
                nodeId: node.id,
                nodeType: type,
                status: 'executing',
                data: JSON.stringify(data),
            },
        });
        try {
            let result = {};
            switch (type) {
                case 'start':
                case 'sequenceEnd':
                    // Nodes que não fazem nada
                    break;
                case 'sendText':
                    await this.executeSendText(execution, data, context);
                    break;
                case 'sendImage':
                    await this.executeSendImage(execution, data, context);
                    break;
                case 'sendVideo':
                    await this.executeSendVideo(execution, data, context);
                    break;
                case 'sendFile':
                    await this.executeSendFile(execution, data, context);
                    break;
                case 'sequenceDelay':
                case 'delay':
                    result.delay = this.parseDelay(data);
                    break;
                case 'changeStatus':
                    await this.executeChangeStatus(execution, data);
                    break;
                case 'labels':
                    await this.executeLabels(execution, data);
                    break;
                case 'assign':
                    await this.executeAssign(execution, data);
                    break;
                case 'sendWATemplate':
                    await this.executeSendWATemplate(execution, data, context);
                    break;
                case 'waitForResponse':
                    // Pausa a execução e aguarda resposta do usuário
                    await database_1.default.sequenceExecution.update({
                        where: { id: execution.id },
                        data: {
                            status: 'waiting',
                            currentNodeId: node.id,
                            context: JSON.stringify(context),
                        },
                    });
                    logger_1.default.info('Sequência pausada aguardando resposta', {
                        executionId: execution.id,
                        nodeId: node.id,
                        conversationId: execution.conversationId
                    });
                    // Retorna sem continuar para o próximo node
                    return { context };
                default:
                    logger_1.default.warn(`Node type ${type} não suportado em sequências`);
            }
            // Marca step como completed
            await database_1.default.sequenceStep.update({
                where: { id: step.id },
                data: {
                    status: 'completed',
                    executedAt: new Date(),
                },
            });
            return result;
        }
        catch (error) {
            // Marca step como failed
            await database_1.default.sequenceStep.update({
                where: { id: step.id },
                data: {
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                    executedAt: new Date(),
                },
            });
            throw error;
        }
    }
    /**
     * Processa steps agendados
     * Chamado pelo scheduler a cada minuto
     */
    async processScheduledSteps() {
        try {
            const now = new Date();
            // Busca steps agendados para agora ou antes
            const steps = await database_1.default.sequenceStep.findMany({
                where: {
                    status: 'scheduled',
                    scheduledFor: { lte: now },
                },
                include: {
                    execution: {
                        include: { flow: true },
                    },
                },
                take: 50, // Limita para não sobrecarregar
            });
            logger_1.default.info(`Processando ${steps.length} steps agendados`);
            for (const step of steps) {
                try {
                    // Marca como executando
                    await database_1.default.sequenceStep.update({
                        where: { id: step.id },
                        data: { status: 'executing', executedAt: new Date() },
                    });
                    // Processa a execução do ponto onde parou
                    await this.processExecution(step.execution.id);
                }
                catch (error) {
                    logger_1.default.error(`Erro ao processar step ${step.id}:`, error);
                }
            }
        }
        catch (error) {
            logger_1.default.error('Erro ao processar steps agendados:', error);
        }
    }
    /**
     * Encontra o próximo node a ser executado
     */
    findNextNode(currentNodeId, nodes, edges, context) {
        // Busca edges que saem do node atual
        const outgoingEdges = edges.filter((e) => e.source === currentNodeId);
        if (outgoingEdges.length === 0) {
            return null; // Fim do flow
        }
        // Se houver apenas uma edge, usa ela
        if (outgoingEdges.length === 1) {
            const targetNodeId = outgoingEdges[0].target;
            return nodes.find((n) => n.id === targetNodeId) || null;
        }
        // Se houver múltiplas edges (condições), avalia qual seguir
        // TODO: Implementar avaliação de condições
        const targetNodeId = outgoingEdges[0].target;
        return nodes.find((n) => n.id === targetNodeId) || null;
    }
    /**
     * Parse de delay em milissegundos
     */
    parseDelay(data) {
        const value = parseInt(data.value || data.seconds || '0', 10);
        const unit = data.unit || 'days';
        switch (unit) {
            case 'minutes':
                return value * 60 * 1000;
            case 'hours':
                return value * 60 * 60 * 1000;
            case 'days':
                return value * 24 * 60 * 60 * 1000;
            case 'weeks':
                return value * 7 * 24 * 60 * 60 * 1000;
            case 'months':
                // Aproximadamente 30 dias por mês
                return value * 30 * 24 * 60 * 60 * 1000;
            default: // seconds
                return value * 1000;
        }
    }
    /**
     * Executa node sendText
     */
    async executeSendText(execution, data, context) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para enviar mensagem');
        }
        const message = this.replaceVariables(data.message || '', context);
        // Usa credenciais salvas na execução (descriptografadas)
        const jwt = execution.jwtAccessToken ? {
            'access-token': (0, encryption_1.decryptOptional)(execution.jwtAccessToken) ?? '',
            'client': (0, encryption_1.decryptOptional)(execution.jwtClient) ?? '',
            'uid': (0, encryption_1.decryptOptional)(execution.jwtUid) ?? '',
            'expiry': (0, encryption_1.decryptOptional)(execution.jwtExpiry) ?? '',
            'token-type': (0, encryption_1.decryptOptional)(execution.jwtTokenType) ?? 'Bearer'
        } : undefined;
        await chatwoot_1.default.sendMessage(execution.accountId, execution.conversationId, message, jwt, (execution.apiToken ? (0, encryption_1.decryptOptional)(execution.apiToken) ?? execution.apiToken : undefined) || this.botToken);
        logger_1.default.info(`Mensagem enviada para conversa ${execution.conversationId}`);
    }
    /**
     * Executa node sendImage
     */
    async executeSendImage(execution, data, context) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para enviar imagem');
        }
        const imageUrl = this.replaceVariables(data.imageUrl || '', context);
        const caption = data.caption ? this.replaceVariables(data.caption, context) : undefined;
        if (!imageUrl) {
            logger_1.default.warn('SendImage node has no imageUrl');
            return;
        }
        // Usa credenciais salvas na execução (descriptografadas)
        const jwt = execution.jwtAccessToken ? {
            'access-token': (0, encryption_1.decryptOptional)(execution.jwtAccessToken) ?? '',
            'client': (0, encryption_1.decryptOptional)(execution.jwtClient) ?? '',
            'uid': (0, encryption_1.decryptOptional)(execution.jwtUid) ?? '',
            'expiry': (0, encryption_1.decryptOptional)(execution.jwtExpiry) ?? '',
            'token-type': (0, encryption_1.decryptOptional)(execution.jwtTokenType) ?? 'Bearer'
        } : undefined;
        await chatwoot_1.default.sendAttachment(execution.conversationId, imageUrl, caption, execution.accountId, jwt, (execution.apiToken ? (0, encryption_1.decryptOptional)(execution.apiToken) ?? execution.apiToken : undefined) || this.botToken);
        logger_1.default.info(`Imagem enviada para conversa ${execution.conversationId}: ${imageUrl}`);
    }
    /**
     * Executa node sendVideo
     */
    async executeSendVideo(execution, data, context) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para enviar vídeo');
        }
        const videoUrl = this.replaceVariables(data.videoUrl || '', context);
        const caption = data.caption ? this.replaceVariables(data.caption, context) : undefined;
        if (!videoUrl) {
            logger_1.default.warn('SendVideo node has no videoUrl');
            return;
        }
        // Usa credenciais salvas na execução (descriptografadas)
        const jwt = execution.jwtAccessToken ? {
            'access-token': (0, encryption_1.decryptOptional)(execution.jwtAccessToken) ?? '',
            'client': (0, encryption_1.decryptOptional)(execution.jwtClient) ?? '',
            'uid': (0, encryption_1.decryptOptional)(execution.jwtUid) ?? '',
            'expiry': (0, encryption_1.decryptOptional)(execution.jwtExpiry) ?? '',
            'token-type': (0, encryption_1.decryptOptional)(execution.jwtTokenType) ?? 'Bearer'
        } : undefined;
        await chatwoot_1.default.sendAttachment(execution.conversationId, videoUrl, caption, execution.accountId, jwt, (execution.apiToken ? (0, encryption_1.decryptOptional)(execution.apiToken) ?? execution.apiToken : undefined) || this.botToken);
        logger_1.default.info(`Vídeo enviado para conversa ${execution.conversationId}: ${videoUrl}`);
    }
    /**
     * Executa node sendFile
     */
    async executeSendFile(execution, data, context) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para enviar arquivo');
        }
        const fileUrl = this.replaceVariables(data.fileUrl || '', context);
        const caption = data.caption ? this.replaceVariables(data.caption, context) : undefined;
        if (!fileUrl) {
            logger_1.default.warn('SendFile node has no fileUrl');
            return;
        }
        // Usa credenciais salvas na execução (descriptografadas)
        const jwt = execution.jwtAccessToken ? {
            'access-token': (0, encryption_1.decryptOptional)(execution.jwtAccessToken) ?? '',
            'client': (0, encryption_1.decryptOptional)(execution.jwtClient) ?? '',
            'uid': (0, encryption_1.decryptOptional)(execution.jwtUid) ?? '',
            'expiry': (0, encryption_1.decryptOptional)(execution.jwtExpiry) ?? '',
            'token-type': (0, encryption_1.decryptOptional)(execution.jwtTokenType) ?? 'Bearer'
        } : undefined;
        await chatwoot_1.default.sendAttachment(execution.conversationId, fileUrl, caption, execution.accountId, jwt, (execution.apiToken ? (0, encryption_1.decryptOptional)(execution.apiToken) ?? execution.apiToken : undefined) || this.botToken);
        logger_1.default.info(`Arquivo enviado para conversa ${execution.conversationId}: ${fileUrl}`);
    }
    /**
     * Executa node sendWATemplate (WhatsApp Oficial template)
     */
    async executeSendWATemplate(execution, data, context) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para enviar template WhatsApp');
        }
        const templateName = data.templateName;
        const templateLanguage = data.templateLanguage || 'pt_BR';
        if (!templateName) {
            logger_1.default.warn('sendWATemplate node has no templateName configured');
            return;
        }
        // Processa variáveis do template
        const rawVariables = data.variables || [];
        const processedParams = rawVariables.map((v) => this.replaceVariables(v, context));
        const apiToken = (execution.apiToken ? (0, encryption_1.decryptOptional)(execution.apiToken) ?? execution.apiToken : undefined) || this.botToken;
        const jwt = execution.jwtAccessToken ? {
            'access-token': (0, encryption_1.decryptOptional)(execution.jwtAccessToken) ?? '',
            'client': (0, encryption_1.decryptOptional)(execution.jwtClient) ?? '',
            'uid': (0, encryption_1.decryptOptional)(execution.jwtUid) ?? '',
            'expiry': (0, encryption_1.decryptOptional)(execution.jwtExpiry) ?? '',
            'token-type': (0, encryption_1.decryptOptional)(execution.jwtTokenType) ?? 'Bearer'
        } : undefined;
        await chatwoot_1.default.sendWhatsAppTemplate(execution.accountId, execution.conversationId, templateName, templateLanguage, processedParams, apiToken, jwt);
        logger_1.default.info(`Template WhatsApp "${templateName}" enviado para conversa ${execution.conversationId}`);
    }
    /**
     * Executa node changeStatus
     */
    async executeChangeStatus(execution, data) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para alterar status');
        }
        const status = data.status;
        await chatwoot_1.default.updateConversationStatus(execution.accountId, execution.conversationId, status, undefined, this.botToken);
        logger_1.default.info(`Status da conversa ${execution.conversationId} alterado para ${status}`);
    }
    /**
     * Executa node labels
     */
    async executeLabels(execution, data) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para gerenciar labels');
        }
        const action = data.action; // 'add' ou 'remove'
        const labels = data.labels || [];
        if (action === 'add') {
            await chatwoot_1.default.addLabels(execution.conversationId, labels, execution.accountId, undefined, this.botToken);
        }
        else if (action === 'remove') {
            await chatwoot_1.default.removeLabels(execution.conversationId, labels, execution.accountId, undefined, this.botToken);
        }
        logger_1.default.info(`Labels ${action} na conversa ${execution.conversationId}`);
    }
    /**
     * Executa node assign
     */
    async executeAssign(execution, data) {
        if (!execution.conversationId) {
            throw new Error('Conversa não definida para atribuir');
        }
        const assignType = data.assignType; // 'agent' ou 'team'
        const assignId = data.assignId;
        await chatwoot_1.default.assign(execution.conversationId, assignType, assignId, execution.accountId, undefined, this.botToken);
        logger_1.default.info(`Conversa ${execution.conversationId} atribuída a ${assignType} ${assignId}`);
    }
    /**
     * Substitui variáveis no texto
     */
    replaceVariables(text, context) {
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            return context[varName] !== undefined ? String(context[varName]) : match;
        });
    }
    /**
     * Completa uma sequência
     */
    async completeSequence(executionId) {
        const execution = await database_1.default.sequenceExecution.update({
            where: { id: executionId },
            data: {
                status: 'completed',
                completedAt: new Date(),
            },
        });
        logger_1.default.info(`Sequência ${execution.flowId} concluída para contato ${execution.contactId}`);
        io?.to(`account_${execution.accountId}`).emit('sequence:completed', {
            executionId,
            flowId: execution.flowId,
            contactId: execution.contactId,
        });
    }
    /**
     * Pausa uma sequência
     */
    async pauseSequence(executionId) {
        await database_1.default.sequenceExecution.update({
            where: { id: executionId },
            data: {
                status: 'paused',
                pausedAt: new Date(),
            },
        });
        logger_1.default.info(`Sequência ${executionId} pausada`);
    }
    /**
     * Retoma uma sequência pausada
     */
    async resumeSequence(executionId) {
        await database_1.default.sequenceExecution.update({
            where: { id: executionId },
            data: {
                status: 'running',
                pausedAt: null,
            },
        });
        logger_1.default.info(`Sequência ${executionId} retomada`);
        // Processa imediatamente
        await this.processExecution(executionId);
    }
    /**
     * Retoma execução após waitForResponse com a resposta do usuário
     */
    async resumeExecution(executionId, additionalContext = {}) {
        try {
            const execution = await database_1.default.sequenceExecution.findUnique({
                where: { id: executionId },
            });
            if (!execution) {
                throw new Error(`Execução ${executionId} não encontrada`);
            }
            if (execution.status !== 'waiting') {
                logger_1.default.warn(`Tentativa de retomar execução ${executionId} com status ${execution.status}`);
                return;
            }
            logger_1.default.info('Retomando execução após waitForResponse', {
                executionId,
                additionalContext
            });
            // Atualiza status para running
            await database_1.default.sequenceExecution.update({
                where: { id: executionId },
                data: { status: 'running' },
            });
            // Busca o último step executado (que deve ser o waitForResponse)
            const lastStep = await database_1.default.sequenceStep.findFirst({
                where: {
                    executionId,
                },
                orderBy: { id: 'desc' },
            });
            if (!lastStep) {
                throw new Error(`Nenhum step encontrado para execução ${executionId}`);
            }
            // Busca o flow
            const flow = await database_1.default.chatbotFlow.findUnique({
                where: { id: execution.flowId },
            });
            if (!flow) {
                throw new Error(`Flow ${execution.flowId} não encontrado`);
            }
            const flowData = JSON.parse(flow.flowData);
            // Atualiza context com a resposta
            const currentContext = JSON.parse(execution.context || '{}');
            const newContext = { ...currentContext, ...additionalContext };
            await database_1.default.sequenceExecution.update({
                where: { id: executionId },
                data: { context: JSON.stringify(newContext) },
            });
            // Busca o próximo node após o waitForResponse
            const currentNodeId = lastStep.nodeId;
            const { nodes, edges } = flowData;
            const nextNode = this.findNextNode(currentNodeId, nodes, edges, newContext);
            if (!nextNode) {
                // Fim da sequência
                await database_1.default.sequenceExecution.update({
                    where: { id: executionId },
                    data: {
                        status: 'completed',
                        completedAt: new Date(),
                    },
                });
                logger_1.default.info(`Sequência ${executionId} completada após waitForResponse`);
                return;
            }
            // Executa o próximo node
            const result = await this.executeNode(execution, nextNode, newContext);
            const updatedContext = { ...newContext, ...result.context };
            if (result.delay) {
                // Agendar próximo step
                const scheduledFor = new Date(Date.now() + result.delay);
                await database_1.default.sequenceStep.create({
                    data: {
                        executionId,
                        nodeId: nextNode.id,
                        nodeType: nextNode.type,
                        status: 'scheduled',
                        scheduledFor,
                        data: JSON.stringify(nextNode.data),
                    },
                });
                logger_1.default.info(`Próximo step agendado para ${scheduledFor.toISOString()}`);
                // Marca execução como waiting
                await database_1.default.sequenceExecution.update({
                    where: { id: executionId },
                    data: {
                        status: 'waiting',
                        currentNodeId: nextNode.id,
                        context: JSON.stringify(updatedContext),
                    },
                });
            }
            else {
                // Continua executando imediatamente (recursivo)
                await database_1.default.sequenceExecution.update({
                    where: { id: executionId },
                    data: {
                        currentNodeId: nextNode.id,
                        context: JSON.stringify(updatedContext),
                    },
                });
                // Chama processExecution recursivamente
                await this.processExecution(executionId);
            }
        }
        catch (error) {
            logger_1.default.error('Erro ao retomar execução', { executionId, error });
            await database_1.default.sequenceExecution.update({
                where: { id: executionId },
                data: {
                    status: 'failed',
                    completedAt: new Date(),
                },
            });
        }
    }
    /**
     * Cancela uma sequência
     */
    async cancelSequence(executionId) {
        const execution = await database_1.default.sequenceExecution.update({
            where: { id: executionId },
            data: {
                status: 'canceled',
                canceledAt: new Date(),
            },
        });
        // Cancela steps agendados
        await database_1.default.sequenceStep.updateMany({
            where: {
                executionId,
                status: 'scheduled',
            },
            data: {
                status: 'skipped',
            },
        });
        logger_1.default.info(`Sequência ${executionId} cancelada`);
        io?.to(`account_${execution.accountId}`).emit('sequence:canceled', {
            executionId,
            flowId: execution.flowId,
            contactId: execution.contactId,
        });
    }
}
exports.SequenceExecutor = SequenceExecutor;
exports.default = new SequenceExecutor();
//# sourceMappingURL=sequenceExecutor.js.map