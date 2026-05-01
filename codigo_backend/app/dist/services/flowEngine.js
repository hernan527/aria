"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowEngine = void 0;
exports.setFlowEngineSocketIO = setFlowEngineSocketIO;
const database_1 = __importDefault(require("./database"));
const chatwoot_1 = __importDefault(require("./chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const expr_eval_1 = require("expr-eval");
const aiService_1 = __importDefault(require("./aiService"));
const ai_credentials_1 = require("../routes/ai-credentials");
const axios_1 = __importDefault(require("axios"));
const systemSettings_1 = require("./systemSettings");
const pg_1 = require("pg");
const flowQueue_1 = require("../queues/flowQueue");
let io = null;
function setFlowEngineSocketIO(socketIO) {
    io = socketIO;
}
/**
 * Engine de execução de flows de chatbot
 */
class FlowEngine {
    MAX_DEPTH = 50; // Limite de nodes por execução
    MAX_EXECUTION_TIME = 5 * 60 * 1000; // 5 minutos
    botToken;
    constructor() {
        // Token de sistema para envio de mensagens do bot (fallback global)
        this.botToken = process.env.CHATWOOT_BOT_TOKEN;
        if (!this.botToken) {
            logger_1.default.warn('CHATWOOT_BOT_TOKEN not configured - bot messages will be sent without authentication');
        }
    }
    /**
     * Busca o bot token para uma conta (do flow creator ou fallback para SystemSettings/env)
     */
    async getBotToken(accountId, flowId) {
        // Se flowId fornecido, busca token do criador do flow
        if (flowId) {
            const flow = await database_1.default.chatbotFlow.findUnique({
                where: { id: flowId },
                select: { creatorAccessToken: true, createdBy: true },
            });
            // Se já tem token salvo, usa
            if (flow?.creatorAccessToken) {
                return flow.creatorAccessToken;
            }
            // Se não tem token salvo, busca do banco do Chatwoot
            if (flow?.createdBy) {
                const tokenFromDb = await this.getUserTokenFromChatwootDb(accountId, flow.createdBy);
                if (tokenFromDb) {
                    // Salva o token no flow para próximas execuções
                    await database_1.default.chatbotFlow.update({
                        where: { id: flowId },
                        data: { creatorAccessToken: tokenFromDb },
                    });
                    return tokenFromDb;
                }
            }
        }
        // Fallback: busca do SystemSettings ou env
        const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
        return settings.chatwootPlatformToken || this.botToken;
    }
    /**
     * Busca o access token de um usuário diretamente do banco do Chatwoot
     */
    async getUserTokenFromChatwootDb(accountId, userId) {
        let client = null;
        try {
            // Busca a URL do banco do Chatwoot
            const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
            const dbUrl = settings.chatwootDatabaseUrl;
            if (!dbUrl) {
                logger_1.default.warn('CHATWOOT_DATABASE_URL not configured, cannot fetch user token');
                return undefined;
            }
            // Conecta no banco do Chatwoot
            client = new pg_1.Client({ connectionString: dbUrl });
            await client.connect();
            // Busca o access_token mais recente do usuário
            const result = await client.query('SELECT token FROM access_tokens WHERE resource_owner_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
            if (result.rows.length > 0) {
                logger_1.default.info('User access token fetched from Chatwoot database', { userId, accountId });
                return result.rows[0].token;
            }
            logger_1.default.warn('No access token found for user in Chatwoot database', { userId, accountId });
            return undefined;
        }
        catch (error) {
            logger_1.default.error('Failed to fetch user token from Chatwoot database', {
                accountId,
                userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return undefined;
        }
        finally {
            if (client) {
                await client.end();
            }
        }
    }
    /**
     * Executa um flow completo
     */
    async executeFlow(flowId, conversationId, accountId, initialContext = {}) {
        const startTime = Date.now();
        let execution;
        try {
            // Busca o flow
            const flow = await database_1.default.chatbotFlow.findFirst({
                where: { id: flowId, accountId },
            });
            if (!flow) {
                throw new Error(`Flow ${flowId} não encontrado`);
            }
            if (!flow.isActive) {
                logger_1.default.warn(`Flow ${flowId} está inativo, ignorando execução`);
                return;
            }
            const flowData = JSON.parse(flow.flowData);
            const { nodes, edges } = flowData;
            // Verifica se existe contexto de retomada (para waitForResponse)
            const resumeExecutionId = initialContext._resumeExecutionId;
            let currentNodeId;
            let context = { ...initialContext, _flowId: flowId }; // Adiciona flowId no context
            if (resumeExecutionId) {
                // Retomando execução anterior
                execution = await database_1.default.flowExecution.findUnique({
                    where: { id: resumeExecutionId },
                });
                if (!execution) {
                    throw new Error(`Execução ${resumeExecutionId} não encontrada`);
                }
                // Guard: se a execução já foi retomada (não está mais 'waiting'), ignora
                // Isso evita que o timeout dispare depois que o usuário respondeu
                if (execution.status !== 'waiting') {
                    logger_1.default.info(`Execution ${resumeExecutionId} already resumed (status: ${execution.status}), skipping`);
                    return;
                }
                const savedNodeId = execution.currentNodeId || undefined;
                context = {
                    ...JSON.parse(execution.context || '{}'),
                    ...initialContext,
                };
                // Se o node salvo for waitForResponse, avança para o próximo
                // (evita processar o mesmo waitForResponse de novo ao retomar)
                if (savedNodeId) {
                    const savedNode = nodes.find((n) => n.id === savedNodeId);
                    if (savedNode?.type === 'waitForResponse') {
                        currentNodeId = await this.getNextNode(savedNodeId, 'waitForResponse', edges, undefined, undefined) || undefined;
                    }
                    else {
                        currentNodeId = savedNodeId;
                    }
                }
                // Atualiza status para running
                await database_1.default.flowExecution.update({
                    where: { id: resumeExecutionId },
                    data: { status: 'running' },
                });
            }
            else {
                // Nova execução
                execution = await database_1.default.flowExecution.create({
                    data: {
                        flowId,
                        conversationId,
                        accountId,
                        status: 'running',
                        context: JSON.stringify(context),
                    },
                });
                // Emite evento via Socket.IO
                io?.to(`account_${accountId}`).emit('flow:execution:started', {
                    flowId,
                    conversationId,
                    executionId: execution.id,
                });
            }
            logger_1.default.info(`Executing flow ${flowId} for conversation ${conversationId}`, {
                executionId: execution.id,
                resume: !!resumeExecutionId,
            });
            // Encontra o node start se não estiver retomando
            if (!currentNodeId) {
                const startNode = nodes.find((n) => n.type === 'start');
                if (!startNode) {
                    throw new Error('Flow não possui node Start');
                }
                currentNodeId = startNode.id;
            }
            // Loop de execução
            let depth = 0;
            while (currentNodeId && depth < this.MAX_DEPTH) {
                // Verifica timeout
                if (Date.now() - startTime > this.MAX_EXECUTION_TIME) {
                    throw new Error('Timeout: execução excedeu 5 minutos');
                }
                // Busca o node atual
                const currentNode = nodes.find((n) => n.id === currentNodeId);
                if (!currentNode) {
                    throw new Error(`Node ${currentNodeId} não encontrado`);
                }
                logger_1.default.info(`Processing node ${currentNode.id} (${currentNode.type})`);
                // Processa o node
                const result = await this.processNode(execution.id, currentNode, context, conversationId, accountId, nodes, edges);
                // Atualiza contexto
                if (result.context) {
                    context = { ...context, ...result.context };
                }
                // Se o node é waitForResponse, pausa a execução
                if (result.waitForResponse) {
                    await this.saveExecutionState(execution.id, currentNodeId, context, 'waiting');
                    logger_1.default.info(`Flow paused at waitForResponse node ${currentNodeId}`);
                    // Agenda timeout automático se configurado
                    const timeoutSeconds = Number(currentNode.data?.timeout) || 0;
                    if (timeoutSeconds > 0) {
                        await (0, flowQueue_1.enqueueFlowTimeout)(execution.id, flowId, conversationId, accountId, timeoutSeconds);
                        logger_1.default.info(`waitForResponse timeout scheduled: ${timeoutSeconds}s for execution ${execution.id}`);
                    }
                    return; // Sai da execução, será retomada no webhook
                }
                // Se o node é end, finaliza
                if (currentNode.type === 'end') {
                    await this.saveExecutionState(execution.id, currentNodeId, context, 'completed');
                    logger_1.default.info(`Flow completed for conversation ${conversationId}`);
                    // Emite evento de conclusão
                    io?.to(`account_${accountId}`).emit('flow:execution:completed', {
                        flowId,
                        conversationId,
                        executionId: execution.id,
                    });
                    return;
                }
                // Determina próximo node
                const nextNodeId = await this.getNextNode(currentNodeId, currentNode.type, edges, result.conditionResult, result.switchCaseIndex);
                if (!nextNodeId) {
                    logger_1.default.warn(`No next node found for ${currentNodeId}, ending flow`);
                    await this.saveExecutionState(execution.id, currentNodeId, context, 'completed');
                    return;
                }
                currentNodeId = nextNodeId;
                depth++;
            }
            if (depth >= this.MAX_DEPTH) {
                throw new Error(`Flow execution exceeded maximum depth of ${this.MAX_DEPTH} nodes`);
            }
        }
        catch (error) {
            logger_1.default.error(`Flow execution failed for flow ${flowId}:`, error);
            if (execution) {
                await database_1.default.flowExecution.update({
                    where: { id: execution.id },
                    data: {
                        status: 'failed',
                        errorMessage: error.message,
                        completedAt: new Date(),
                    },
                });
                // Emite evento de falha
                io?.to(`account_${accountId}`).emit('flow:execution:failed', {
                    flowId,
                    conversationId,
                    executionId: execution.id,
                    error: error.message,
                });
            }
            throw error;
        }
    }
    /**
     * Processa um node individual
     */
    async processNode(executionId, node, context, conversationId, accountId, nodes, edges) {
        // Salva estado atual
        await this.saveExecutionState(executionId, node.id, context, 'running');
        switch (node.type) {
            case 'start':
                return {}; // Start não faz nada, apenas inicializa
            case 'sendText':
                await this.executeSendText(node, context, conversationId, accountId);
                return {};
            case 'sendImage':
                await this.executeSendImage(node, context, conversationId, accountId);
                return {};
            case 'sendVideo':
                await this.executeSendVideo(node, context, conversationId, accountId);
                return {};
            case 'sendFile':
                await this.executeSendFile(node, context, conversationId, accountId);
                return {};
            case 'sendWATemplate':
                await this.executeSendWATemplate(node, context, conversationId, accountId);
                return {};
            case 'condition':
                const conditionResult = await this.evaluateCondition(node.data.condition, context, conversationId, accountId);
                return { conditionResult };
            case 'switch':
                // Switch SEMPRE aguarda resposta do usuário antes de avaliar
                if (!context.response) {
                    logger_1.default.info('Switch node waiting for user response');
                    return { waitForResponse: true };
                }
                const switchCaseIndex = await this.evaluateSwitch(node.data.cases, context, conversationId, accountId);
                return { switchCaseIndex };
            case 'delay':
                await this.executeDelay(node.data);
                return {};
            case 'changeStatus':
                await this.executeChangeStatus(node.data.status, conversationId, accountId, context);
                return {};
            case 'labels':
                await this.executeLabels(node.data.labels, node.data.action, conversationId, accountId, context);
                return {};
            case 'assign':
                await this.executeAssign(node.data.assignType, node.data.assignId, conversationId, accountId, context);
                return {};
            case 'aiAgent':
                const aiResponse = await this.executeAIAgent(node.id, node.data, conversationId, accountId, context, nodes, edges);
                // Salva a resposta no contexto se configurado
                if (node.data.saveResponseTo) {
                    context[node.data.saveResponseTo] = aiResponse;
                }
                return {};
            case 'httpRequest':
                const httpResponse = await this.executeHttpRequest(node.data, context);
                // Salva a resposta no contexto se configurado
                if (node.data.saveResponseTo) {
                    context[node.data.saveResponseTo] = httpResponse;
                }
                return {};
            case 'waitForResponse':
                return { waitForResponse: true };
            case 'input': {
                // Input aguarda resposta e salva em uma variável nomeada.
                // Usa _waitingForInputNodeId para distinguir primeira execução (aguardar)
                // de retomada (capturar resposta). Isso evita capturar a mensagem que
                // disparou o flow (ex: botão do switch) como resposta prematura.
                const isWaitingForThisNode = context._waitingForInputNodeId === node.id;
                if (!isWaitingForThisNode) {
                    logger_1.default.info('Input node waiting for user response');
                    // Opcionalmente envia uma mensagem antes de aguardar
                    if (node.data.message) {
                        await this.executeSendText(node, context, conversationId, accountId);
                    }
                    // Salva flag no contexto para identificar retomada correta
                    return { waitForResponse: true, context: { _waitingForInputNodeId: node.id } };
                }
                // Retomada: captura a resposta do usuário na variável especificada
                const variableName = node.data.variableName || 'userInput';
                const newContext = { ...context, [variableName]: context.response, _waitingForInputNodeId: null };
                logger_1.default.info(`Input node saved response to variable "${variableName}"`, {
                    value: context.response,
                });
                return { context: newContext };
            }
            case 'checkResponse':
                // Verifica se houve resposta do usuário (para flows de sequência)
                // Retorna true/false através de conditionResult para permitir branching
                const hasResponse = !!context.userReplied;
                logger_1.default.info(`CheckResponse node evaluated`, { hasResponse });
                // Salva no contexto se configurado
                if (node.data.saveResponseTo) {
                    context[node.data.saveResponseTo] = hasResponse;
                }
                return { conditionResult: hasResponse };
            case 'end':
                return {}; // End será tratado no loop principal
            default:
                logger_1.default.warn(`Unknown node type: ${node.type}`);
                return {};
        }
    }
    /**
     * Determina o próximo node baseado nas edges
     */
    async getNextNode(currentNodeId, nodeType, edges, conditionResult, switchCaseIndex) {
        const outgoingEdges = edges.filter((e) => e.source === currentNodeId);
        if (outgoingEdges.length === 0) {
            return null; // Não há próximo node
        }
        // Se é um switch e não encontrou match, encerra o flow
        if (nodeType === 'switch' && switchCaseIndex === undefined) {
            logger_1.default.info('Switch has no matching case, ending flow');
            return null;
        }
        // Se há resultado de switch válido, filtra pela handle correta (case-0, case-1, etc)
        if (switchCaseIndex !== undefined) {
            const handleId = `case-${switchCaseIndex}`;
            const edge = outgoingEdges.find((e) => e.sourceHandle === handleId);
            if (edge) {
                logger_1.default.info(`Switch took path: ${handleId}`);
                return edge.target;
            }
            logger_1.default.warn(`No edge found for switch case ${handleId}`);
            return null;
        }
        // Se há resultado de condição, filtra pela handle correta
        if (conditionResult !== undefined) {
            const edge = outgoingEdges.find((e) => {
                if (conditionResult) {
                    return e.sourceHandle === 'true' || !e.sourceHandle;
                }
                else {
                    return e.sourceHandle === 'false';
                }
            });
            return edge ? edge.target : null;
        }
        // Caso padrão: retorna o primeiro edge
        return outgoingEdges[0].target;
    }
    /**
     * Substitui variáveis no texto
     */
    replaceVariables(text, context) {
        let result = text;
        // Substitui variáveis do contexto: {{variavel}}
        Object.keys(context).forEach((key) => {
            if (!key.startsWith('_')) {
                // Ignora variáveis internas que começam com _
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                result = result.replace(regex, String(context[key]));
            }
        });
        return result;
    }
    /**
     * Executa node: sendWATemplate
     * Envia um template de WhatsApp via Chatwoot API
     */
    async executeSendWATemplate(node, context, conversationId, accountId) {
        const { templateName, templateLanguage = 'pt_BR', variables = [] } = node.data;
        if (!templateName) {
            logger_1.default.warn('SendWATemplate node has no templateName');
            return;
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        // Substitui variáveis nos parâmetros do template
        const processedParams = variables.map((v) => this.replaceVariables(v, context));
        try {
            await chatwoot_1.default.sendWhatsAppTemplate(accountId, conversationId, templateName, templateLanguage, processedParams, botToken);
            logger_1.default.info(`Sent WA template '${templateName}' to conversation ${conversationId}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to send WA template '${templateName}'`, { error: error.message });
            throw error;
        }
    }
    /**
     * Executa node: sendText
     */
    async executeSendText(node, context, conversationId, accountId) {
        const message = this.replaceVariables(node.data.message || '', context);
        if (!message) {
            logger_1.default.warn('SendText node has empty message');
            return;
        }
        // Busca token do flow creator
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        // Envia mensagem via Chatwoot API com token do bot
        await chatwoot_1.default.sendMessage(accountId, conversationId, message, undefined, botToken);
        logger_1.default.info(`Sent message to conversation ${conversationId}: ${message.substring(0, 50)}...`);
    }
    /**
     * Executa node: sendImage
     */
    async executeSendImage(node, context, conversationId, accountId) {
        const imageUrl = node.data.imageUrl;
        const caption = node.data.caption ? this.replaceVariables(node.data.caption, context) : undefined;
        if (!imageUrl) {
            logger_1.default.warn('SendImage node has no imageUrl');
            return;
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        await chatwoot_1.default.sendAttachment(conversationId, imageUrl, caption, accountId, undefined, botToken);
        logger_1.default.info(`Sent image to conversation ${conversationId}: ${imageUrl}`);
    }
    /**
     * Executa node sendVideo
     */
    async executeSendVideo(node, context, conversationId, accountId) {
        const videoUrl = node.data.videoUrl;
        const caption = node.data.caption ? this.replaceVariables(node.data.caption, context) : undefined;
        if (!videoUrl) {
            logger_1.default.warn('SendVideo node has no videoUrl');
            return;
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        await chatwoot_1.default.sendAttachment(conversationId, videoUrl, caption, accountId, undefined, botToken);
        logger_1.default.info(`Sent video to conversation ${conversationId}: ${videoUrl}`);
    }
    /**
     * Executa node sendFile
     */
    async executeSendFile(node, context, conversationId, accountId) {
        const fileUrl = node.data.fileUrl;
        const caption = node.data.caption ? this.replaceVariables(node.data.caption, context) : undefined;
        if (!fileUrl) {
            logger_1.default.warn('SendFile node has no fileUrl');
            return;
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        await chatwoot_1.default.sendAttachment(conversationId, fileUrl, caption, accountId, undefined, botToken);
        logger_1.default.info(`Sent file to conversation ${conversationId}: ${fileUrl}`);
    }
    /**
     * Avalia condição - suporta tanto expressões matemáticas quanto operações de string
     */
    async evaluateCondition(condition, context, conversationId = 0, accountId = 0) {
        if (!condition) {
            logger_1.default.warn('Condition node has empty condition, defaulting to true');
            return true;
        }
        // Verificação de etiqueta (tag) — busca labels da conversa no Chatwoot
        if (condition.startsWith('__hasLabel:') || condition.startsWith('__notHasLabel:')) {
            const isHas = condition.startsWith('__hasLabel:');
            const tagName = condition.replace(/^__(?:not)?hasLabel:/, '').trim().toLowerCase();
            try {
                const botToken = await this.getBotToken(accountId, context._flowId);
                const conversation = await chatwoot_1.default.getConversation(accountId, conversationId, undefined, botToken || undefined);
                const conversationLabels = (conversation?.labels || []).map((l) => l.toLowerCase());
                const hasTag = conversationLabels.includes(tagName);
                logger_1.default.info('Label condition evaluated', { tagName, hasTag, isHas, conversationLabels, conversationId });
                return isHas ? hasTag : !hasTag;
            }
            catch (error) {
                logger_1.default.error('Failed to evaluate label condition', { condition, conversationId, error: error?.message });
                return false;
            }
        }
        try {
            // Se a condição contém métodos JavaScript (.includes, .startsWith, etc), avalia de forma segura
            if (this.isStringCondition(condition)) {
                return this.evaluateStringCondition(condition, context);
            }
            // Caso contrário, usa expr-eval para expressões matemáticas
            const parser = new expr_eval_1.Parser();
            const result = parser.evaluate(condition, context);
            return Boolean(result);
        }
        catch (error) {
            logger_1.default.error(`Error evaluating condition "${condition}":`, error);
            return false; // Default em caso de erro
        }
    }
    /**
     * Verifica se é uma condição de string (contém métodos JavaScript)
     */
    isStringCondition(condition) {
        const stringMethods = ['.includes(', '.startsWith(', '.endsWith(', '.toLowerCase(', '.toUpperCase('];
        return stringMethods.some(method => condition.includes(method));
    }
    /**
     * Avalia condição de string de forma segura
     */
    evaluateStringCondition(condition, context) {
        try {
            // Cria uma função segura com apenas as variáveis do contexto disponíveis
            const contextVars = Object.keys(context)
                .filter(key => !key.startsWith('_'))
                .map(key => `const ${key} = context.${key} || '';`)
                .join('\n');
            logger_1.default.info('Evaluating string condition', {
                condition,
                contextVars: Object.keys(context).filter(key => !key.startsWith('_')),
                contextValues: Object.keys(context)
                    .filter(key => !key.startsWith('_'))
                    .reduce((acc, key) => ({ ...acc, [key]: context[key] }), {})
            });
            const safeEval = new Function('context', `
        ${contextVars}
        try {
          return ${condition};
        } catch (e) {
          return false;
        }
      `);
            const result = safeEval(context);
            logger_1.default.info('String condition evaluation result', {
                condition,
                result
            });
            return Boolean(result);
        }
        catch (error) {
            logger_1.default.error(`Error evaluating string condition "${condition}":`, error);
            return false;
        }
    }
    /**
     * Avalia um switch node e retorna o índice do case que corresponder
     */
    async evaluateSwitch(cases, context, conversationId = 0, accountId = 0) {
        if (!cases || cases.length === 0) {
            logger_1.default.warn('Switch node has no cases');
            return undefined;
        }
        logger_1.default.info('Switch evaluation started', {
            totalCases: cases.length,
            contextKeys: Object.keys(context),
            contextResponse: context.response
        });
        // Avalia cada case na ordem
        for (let i = 0; i < cases.length; i++) {
            const switchCase = cases[i];
            const condition = switchCase.condition;
            logger_1.default.info(`Evaluating switch case ${i}`, {
                label: switchCase.label,
                condition,
                field: switchCase.field,
                operator: switchCase.operator,
                value: switchCase.value
            });
            if (!condition) {
                logger_1.default.warn(`Switch case ${i} (${switchCase.label}) has no condition`);
                continue;
            }
            try {
                const result = await this.evaluateCondition(condition, context, conversationId, accountId);
                logger_1.default.info(`Switch case ${i} evaluation result`, {
                    label: switchCase.label,
                    condition,
                    result
                });
                if (result) {
                    logger_1.default.info(`Switch matched case ${i}: ${switchCase.label}`);
                    return i;
                }
            }
            catch (error) {
                logger_1.default.error(`Error evaluating switch case ${i}:`, error);
                continue;
            }
        }
        // Nenhum case correspondeu
        logger_1.default.info('Switch has no matching case, ending flow');
        return undefined;
    }
    /**
     * Executa node: delay
     * Suporta modo fixo (seconds) e modo range aleatório (minSeconds, maxSeconds)
     */
    async executeDelay(data) {
        let seconds;
        if (data.delayType === 'range' && data.minSeconds > 0 && data.maxSeconds > data.minSeconds) {
            // Sorteia um valor aleatório inteiro entre min e max (inclusive)
            const min = Math.ceil(data.minSeconds);
            const max = Math.floor(Math.min(data.maxSeconds, 60));
            seconds = Math.floor(Math.random() * (max - min + 1)) + min;
            logger_1.default.info(`Delay range: sorteado ${seconds}s (entre ${min}s e ${max}s)`);
        }
        else {
            seconds = data.seconds || (typeof data === 'number' ? data : 0);
        }
        if (!seconds || seconds <= 0) {
            return;
        }
        const ms = Math.min(seconds * 1000, 60000); // Máximo 60 segundos
        await new Promise((resolve) => setTimeout(resolve, ms));
        logger_1.default.info(`Delayed ${ms}ms`);
    }
    /**
     * Executa node: changeStatus
     */
    async executeChangeStatus(status, conversationId, accountId, context) {
        if (!status) {
            logger_1.default.warn('ChangeStatus node has no status');
            return;
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        await chatwoot_1.default.updateConversationStatus(accountId, conversationId, status, undefined, botToken);
        logger_1.default.info(`Changed status of conversation ${conversationId} to ${status}`);
    }
    /**
     * Executa node: labels (add ou remove)
     */
    async executeLabels(labels, action, conversationId, accountId, context) {
        if (!labels || labels.length === 0) {
            logger_1.default.warn('Labels node has no labels');
            return;
        }
        if (!action) {
            logger_1.default.warn('Labels node has no action specified, defaulting to add');
            action = 'add';
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        if (action === 'add') {
            await chatwoot_1.default.addLabels(conversationId, labels, accountId, undefined, botToken);
            logger_1.default.info(`Added labels to conversation ${conversationId}: ${labels.join(', ')}`);
        }
        else {
            await chatwoot_1.default.removeLabels(conversationId, labels, accountId, undefined, botToken);
            logger_1.default.info(`Removed labels from conversation ${conversationId}: ${labels.join(', ')}`);
        }
    }
    /**
     * Executa node: assign (agent ou team)
     */
    async executeAssign(assignType, assignId, conversationId, accountId, context) {
        if (!assignId) {
            logger_1.default.warn('Assign node has no assignId');
            return;
        }
        if (!assignType) {
            logger_1.default.warn('Assign node has no assignType, defaulting to agent');
            assignType = 'agent';
        }
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        await chatwoot_1.default.assign(conversationId, assignType, assignId, accountId, undefined, botToken);
        logger_1.default.info(`Assigned ${assignType} ${assignId} to conversation ${conversationId}`);
    }
    /**
     * Executa node: aiAgent (OpenAI ou Groq)
     */
    async executeAIAgent(nodeId, data, conversationId, accountId, context, nodes, edges) {
        if (!data.provider || !data.model || !data.prompt) {
            logger_1.default.warn('AIAgent node missing required fields');
            throw new Error('AIAgent node precisa ter provider, model e prompt configurados');
        }
        // Busca credencial do provedor
        const apiKey = await (0, ai_credentials_1.getDecryptedCredential)(accountId, data.provider);
        if (!apiKey) {
            logger_1.default.error(`No API key found for provider ${data.provider}`);
            throw new Error(`Credencial não configurada para o provedor ${data.provider}`);
        }
        logger_1.default.info(`Executing AI Agent with ${data.provider} - ${data.model}`, {
            conversationId,
            accountId,
        });
        // Busca as últimas mensagens da conversa para manter contexto
        const flowId = context._flowId;
        const botToken = await this.getBotToken(accountId, flowId);
        const chatwootMessages = await chatwoot_1.default.getConversationMessages(accountId, conversationId, undefined, botToken);
        // Constrói o array de mensagens no formato da API
        const messages = [];
        // 1. Adiciona o prompt do node como mensagem de sistema
        let systemPrompt = aiService_1.default.interpolateVariables(data.prompt, context);
        // 1.1. Busca bases de conhecimento conectadas ao AI Agent através dos edges
        let knowledgeBaseContext = '';
        const connectedKBNodes = edges
            .filter(edge => edge.target === nodeId && edge.targetHandle === 'knowledge-base')
            .map(edge => nodes.find(n => n.id === edge.source))
            .filter(node => node && node.type === 'knowledgeBase');
        if (connectedKBNodes.length > 0) {
            const kbIds = connectedKBNodes
                .map(node => node.data.knowledgeBaseId)
                .filter(id => id !== undefined && id !== null);
            if (kbIds.length > 0) {
                knowledgeBaseContext = await this.getKnowledgeBaseContext(accountId, kbIds);
                logger_1.default.info('Knowledge base context added to AI Agent', {
                    contextLength: knowledgeBaseContext.length,
                    knowledgeBaseIds: kbIds,
                    connectedNodes: connectedKBNodes.length,
                });
            }
        }
        if (knowledgeBaseContext) {
            systemPrompt = `${systemPrompt}\n\n## Base de Conhecimento:\n${knowledgeBaseContext}`;
        }
        messages.push({
            role: 'system',
            content: systemPrompt,
        });
        // 2. Adiciona as últimas 10 mensagens da conversa (para manter contexto)
        const recentMessages = chatwootMessages
            .filter(m => 
        // Filtra apenas mensagens de texto relevantes
        m.message_type !== 'activity' &&
            !m.private &&
            m.content &&
            m.content.trim().length > 0)
            .slice(-10) // Últimas 10 mensagens
            .map(m => {
            // Converte para o formato da API
            const role = m.message_type === 'incoming' ? 'user' : 'assistant';
            return {
                role,
                content: m.content,
            };
        });
        messages.push(...recentMessages);
        // 3. Se houver uma mensagem do usuário no contexto (resposta atual), adiciona
        if (context.response && typeof context.response === 'string') {
            messages.push({
                role: 'user',
                content: context.response,
            });
        }
        logger_1.default.info(`AI Agent - messages prepared`, {
            conversationId,
            totalMessages: messages.length,
            systemPrompt: systemPrompt.substring(0, 100) + '...',
        });
        // Chama o serviço de IA com o histórico completo
        const response = await aiService_1.default.execute(data.provider, apiKey, data, messages);
        logger_1.default.info(`AI Agent response received`, {
            conversationId,
            model: response.model,
            contentLength: response.content.length,
            usage: response.usage,
        });
        // Opcionalmente envia a resposta de volta para o chat
        // (pode ser configurado no node)
        if (data.sendToChat !== false) {
            await chatwoot_1.default.sendMessage(accountId, conversationId, response.content, undefined, botToken);
        }
        return response.content;
    }
    /**
     * Busca conteúdo das bases de conhecimento
     */
    async getKnowledgeBaseContext(accountId, knowledgeBaseIds) {
        try {
            // Coleta todos os documentos das bases especificadas
            let allContext = '';
            for (const kbId of knowledgeBaseIds) {
                // Busca documentos da base de conhecimento
                const documents = await database_1.default.knowledgeDocument.findMany({
                    where: {
                        knowledgeBaseId: kbId,
                        knowledgeBase: {
                            accountId: accountId,
                        },
                    },
                    select: {
                        originalName: true,
                        content: true,
                    },
                });
                if (documents.length > 0) {
                    for (const doc of documents) {
                        allContext += `\n\n### Documento: ${doc.originalName}\n${doc.content}`;
                    }
                }
            }
            return allContext.trim();
        }
        catch (error) {
            logger_1.default.error('Error fetching knowledge base context:', error);
            return '';
        }
    }
    /**
     * Executa node: httpRequest (dispara webhook externo)
     */
    async executeHttpRequest(data, context) {
        try {
            const method = data.method || 'POST';
            let url = data.url || '';
            const headers = data.headers || {};
            let body = data.body || '';
            const timeout = data.timeout || 10000;
            if (!url || !url.trim()) {
                logger_1.default.warn('HTTP Request node has no URL configured');
                throw new Error('URL é obrigatória para HTTP Request');
            }
            // Interpola variáveis na URL
            url = this.replaceVariables(url, context);
            // Interpola variáveis no body (se for string JSON)
            if (body && typeof body === 'string') {
                body = this.replaceVariables(body, context);
            }
            // Interpola variáveis nos headers
            const interpolatedHeaders = {};
            for (const [key, value] of Object.entries(headers)) {
                interpolatedHeaders[key] = this.replaceVariables(value, context);
            }
            // Configuração da requisição
            const config = {
                method: method.toUpperCase(),
                url,
                headers: interpolatedHeaders,
                timeout,
            };
            // Adiciona body para métodos que aceitam
            if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
                try {
                    config.data = JSON.parse(body);
                }
                catch (parseError) {
                    logger_1.default.warn('HTTP Request body is not valid JSON, sending as string');
                    config.data = body;
                }
            }
            logger_1.default.info(`Executing HTTP Request: ${method} ${url}`, {
                hasHeaders: Object.keys(interpolatedHeaders).length > 0,
                hasBody: !!config.data,
            });
            // Executa a requisição
            const response = await (0, axios_1.default)(config);
            logger_1.default.info(`HTTP Request completed: ${method} ${url}`, {
                status: response.status,
                statusText: response.statusText,
            });
            // Retorna a resposta
            return {
                status: response.status,
                statusText: response.statusText,
                data: response.data,
                headers: response.headers,
            };
        }
        catch (error) {
            logger_1.default.error('Error executing HTTP Request:', {
                message: error.message,
                url: data.url,
                method: data.method,
                status: error.response?.status,
                statusText: error.response?.statusText,
            });
            // Retorna erro estruturado
            return {
                error: true,
                message: error.message,
                status: error.response?.status || 0,
                statusText: error.response?.statusText || 'Error',
                data: error.response?.data || null,
            };
        }
    }
    /**
     * Salva estado da execução no banco
     */
    async saveExecutionState(executionId, currentNodeId, context, status) {
        await database_1.default.flowExecution.update({
            where: { id: executionId },
            data: {
                currentNodeId,
                context: JSON.stringify(context),
                status,
                ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
            },
        });
    }
}
exports.FlowEngine = FlowEngine;
//# sourceMappingURL=flowEngine.js.map