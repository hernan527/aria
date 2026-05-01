"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const sequenceExecutor_1 = __importDefault(require("../services/sequenceExecutor"));
const logger_1 = __importDefault(require("../utils/logger"));
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const router = (0, express_1.Router)();
/**
 * GET /api/sequences
 * Lista sequências (flows do tipo sequence)
 */
router.get('/', async (req, res) => {
    try {
        const { account_id: accountId } = req.user;
        const sequences = await database_1.default.chatbotFlow.findMany({
            where: {
                accountId,
                type: 'sequence',
            },
            include: {
                _count: {
                    select: {
                        sequenceExecutions: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Busca estatísticas de cada sequência
        const sequencesWithStats = await Promise.all(sequences.map(async (seq) => {
            const stats = await database_1.default.sequenceExecution.groupBy({
                by: ['status'],
                where: { flowId: seq.id },
                _count: true,
            });
            return {
                ...seq,
                stats: stats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
            };
        }));
        res.json({ data: sequencesWithStats });
    }
    catch (error) {
        logger_1.default.error('Erro ao listar sequências:', error);
        res.status(500).json({ error: 'Erro ao listar sequências' });
    }
});
/**
 * POST /api/sequences
 * Cria nova sequência
 */
router.post('/', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { name, description, trigger, flowData } = req.body;
        const sequence = await database_1.default.chatbotFlow.create({
            data: {
                name,
                description,
                accountId,
                type: 'sequence',
                trigger: JSON.stringify(trigger || {}),
                flowData: JSON.stringify(flowData || { nodes: [], edges: [] }),
                createdBy: userId,
            },
        });
        res.json({ data: sequence });
    }
    catch (error) {
        logger_1.default.error('Erro ao criar sequência:', error);
        res.status(500).json({ error: 'Erro ao criar sequência' });
    }
});
/**
 * GET /api/sequences/:id
 * Detalhes de uma sequência
 */
router.get('/:id', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const sequence = await database_1.default.chatbotFlow.findFirst({
            where: {
                id: parseInt(id),
                accountId,
                type: 'sequence',
            },
            include: {
                sequenceExecutions: {
                    orderBy: { startedAt: 'desc' },
                    take: 10,
                },
            },
        });
        if (!sequence) {
            return res.status(404).json({ error: 'Sequência não encontrada' });
        }
        res.json({ data: sequence });
    }
    catch (error) {
        logger_1.default.error('Erro ao buscar sequência:', error);
        res.status(500).json({ error: 'Erro ao buscar sequência' });
    }
});
/**
 * PUT /api/sequences/:id
 * Atualiza sequência
 */
router.put('/:id', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const { name, description, trigger, flowData, isActive } = req.body;
        const sequence = await database_1.default.chatbotFlow.updateMany({
            where: {
                id: parseInt(id),
                accountId,
                type: 'sequence',
            },
            data: {
                name,
                description,
                trigger: trigger ? JSON.stringify(trigger) : undefined,
                flowData: flowData ? JSON.stringify(flowData) : undefined,
                isActive,
            },
        });
        if (sequence.count === 0) {
            return res.status(404).json({ error: 'Sequência não encontrada' });
        }
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao atualizar sequência:', error);
        res.status(500).json({ error: 'Erro ao atualizar sequência' });
    }
});
/**
 * DELETE /api/sequences/:id
 * Remove sequência
 */
router.delete('/:id', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const sequence = await database_1.default.chatbotFlow.deleteMany({
            where: {
                id: parseInt(id),
                accountId,
                type: 'sequence',
            },
        });
        if (sequence.count === 0) {
            return res.status(404).json({ error: 'Sequência não encontrada' });
        }
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao remover sequência:', error);
        res.status(500).json({ error: 'Erro ao remover sequência' });
    }
});
/**
 * POST /api/sequences/:id/start
 * Inicia sequência para um contato
 */
router.post('/:id/start', async (req, res) => {
    try {
        const authReq = req;
        const { account_id: accountId, id: userId } = authReq.user;
        const { id } = req.params;
        const { contactId, conversationId, context } = req.body;
        logger_1.default.info('Requisição para iniciar sequência recebida', {
            flowId: id,
            contactId,
            conversationId,
            accountId,
            userId
        });
        if (!contactId) {
            logger_1.default.warn('contactId não fornecido', { flowId: id, body: req.body });
            return res.status(400).json({ error: 'contactId é obrigatório' });
        }
        const executionId = await sequenceExecutor_1.default.startSequence(parseInt(id), contactId, accountId, conversationId, context || {}, authReq.jwt, // Passa JWT do usuário
        authReq.apiToken // Passa API token do usuário
        );
        logger_1.default.info('Sequência iniciada com sucesso', {
            flowId: id,
            executionId,
            contactId,
            conversationId
        });
        res.json({ success: true, executionId });
    }
    catch (error) {
        logger_1.default.error('Erro ao iniciar sequência:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao iniciar sequência' });
    }
});
/**
 * GET /api/sequences/:id/executions
 * Lista execuções de uma sequência
 */
router.get('/:id/executions', async (req, res) => {
    try {
        const authReq = req;
        const { account_id: accountId, id: userId } = authReq.user;
        const { id } = req.params;
        const { status, limit = 50 } = req.query;
        const where = {
            flowId: parseInt(id),
            accountId,
        };
        if (status) {
            where.status = status;
        }
        const executions = await database_1.default.sequenceExecution.findMany({
            where,
            include: {
                steps: {
                    orderBy: { id: 'asc' },
                },
            },
            orderBy: { startedAt: 'desc' },
        });
        // Agrupa execuções por conversationId (contato)
        const groupedByContact = new Map();
        for (const execution of executions) {
            if (execution.conversationId) {
                const convId = execution.conversationId;
                if (!groupedByContact.has(convId)) {
                    groupedByContact.set(convId, []);
                }
                groupedByContact.get(convId).push(execution);
            }
        }
        // Para cada contato, busca dados do Chatwoot e monta resposta agrupada
        const groupedExecutions = await Promise.all(Array.from(groupedByContact.entries()).map(async ([conversationId, contactExecutions]) => {
            let contactPhone = null;
            let contactName = null;
            // Busca dados do contato
            try {
                const conversation = await chatwoot_1.default.getConversation(accountId, conversationId, authReq.jwt, authReq.apiToken);
                if (conversation?.meta?.sender) {
                    contactPhone = conversation.meta.sender.phone_number || null;
                    contactName = conversation.meta.sender.name || null;
                }
            }
            catch (error) {
                logger_1.default.warn(`Failed to fetch contact for conversation ${conversationId}:`, error);
            }
            // Ordena execuções por data (mais recente primeiro)
            contactExecutions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
            // Última execução (status atual)
            const latestExecution = contactExecutions[0];
            return {
                conversationId,
                contactPhone,
                contactName,
                status: latestExecution.status,
                currentNodeId: latestExecution.currentNodeId,
                lastUpdated: latestExecution.completedAt || latestExecution.startedAt,
                totalExecutions: contactExecutions.length,
                executions: contactExecutions.map(exec => ({
                    id: exec.id,
                    status: exec.status,
                    startedAt: exec.startedAt,
                    completedAt: exec.completedAt,
                    errorMessage: exec.errorMessage,
                    currentNodeId: exec.currentNodeId,
                    steps: exec.steps,
                })),
            };
        }));
        // Ordena por última atualização
        groupedExecutions.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        res.json({ data: groupedExecutions.slice(0, parseInt(limit)) });
    }
    catch (error) {
        logger_1.default.error('Erro ao listar execuções:', error);
        res.status(500).json({ error: 'Erro ao listar execuções' });
    }
});
/**
 * GET /api/executions/:id
 * Detalhes de uma execução
 */
router.get('/executions/:id', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const execution = await database_1.default.sequenceExecution.findFirst({
            where: {
                id: parseInt(id),
                accountId,
            },
            include: {
                flow: true,
                steps: {
                    orderBy: { id: 'asc' },
                },
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        res.json({ data: execution });
    }
    catch (error) {
        logger_1.default.error('Erro ao buscar execução:', error);
        res.status(500).json({ error: 'Erro ao buscar execução' });
    }
});
/**
 * POST /api/executions/:id/pause
 * Pausa uma execução
 */
router.post('/executions/:id/pause', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        // Verifica se execução pertence ao account
        const execution = await database_1.default.sequenceExecution.findFirst({
            where: {
                id: parseInt(id),
                accountId,
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        await sequenceExecutor_1.default.pauseSequence(parseInt(id));
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao pausar execução:', error);
        res.status(500).json({ error: 'Erro ao pausar execução' });
    }
});
/**
 * POST /api/executions/:id/resume
 * Retoma uma execução pausada
 */
router.post('/executions/:id/resume', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const execution = await database_1.default.sequenceExecution.findFirst({
            where: {
                id: parseInt(id),
                accountId,
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        await sequenceExecutor_1.default.resumeSequence(parseInt(id));
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao retomar execução:', error);
        res.status(500).json({ error: 'Erro ao retomar execução' });
    }
});
/**
 * POST /api/executions/:id/cancel
 * Cancela uma execução
 */
router.post('/executions/:id/cancel', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { id } = req.params;
        const execution = await database_1.default.sequenceExecution.findFirst({
            where: {
                id: parseInt(id),
                accountId,
            },
        });
        if (!execution) {
            return res.status(404).json({ error: 'Execução não encontrada' });
        }
        await sequenceExecutor_1.default.cancelSequence(parseInt(id));
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Erro ao cancelar execução:', error);
        res.status(500).json({ error: 'Erro ao cancelar execução' });
    }
});
/**
 * GET /api/contacts/:contactId/sequences
 * Lista sequências ativas de um contato
 */
router.get('/contacts/:contactId/sequences', async (req, res) => {
    try {
        const { account_id: accountId, id: userId } = req.user;
        const { contactId } = req.params;
        const executions = await database_1.default.sequenceExecution.findMany({
            where: {
                contactId: parseInt(contactId),
                accountId,
                status: { in: ['pending', 'running', 'waiting', 'paused'] },
            },
            include: {
                flow: true,
                steps: {
                    orderBy: { id: 'asc' },
                    take: 5,
                },
            },
            orderBy: { startedAt: 'desc' },
        });
        // Filtra execuções cujo flow ainda existe (não foi deletado)
        const validExecutions = executions.filter(exec => exec.flow !== null);
        // Cancela execuções órfãs (cujo flow foi deletado)
        const orphanExecutions = executions.filter(exec => exec.flow === null);
        if (orphanExecutions.length > 0) {
            logger_1.default.warn(`Found ${orphanExecutions.length} orphan sequence executions, marking as cancelled`, {
                executionIds: orphanExecutions.map(e => e.id),
                contactId: parseInt(contactId),
            });
            await database_1.default.sequenceExecution.updateMany({
                where: {
                    id: { in: orphanExecutions.map(e => e.id) },
                },
                data: {
                    status: 'canceled',
                    errorMessage: 'Flow foi deletado',
                    completedAt: new Date(),
                },
            });
        }
        res.json({ data: validExecutions });
    }
    catch (error) {
        logger_1.default.error('Erro ao listar sequências do contato:', error);
        res.status(500).json({ error: 'Erro ao listar sequências do contato' });
    }
});
exports.default = router;
//# sourceMappingURL=sequences.js.map