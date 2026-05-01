"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowQueue = void 0;
exports.enqueueFlow = enqueueFlow;
exports.resumeFlow = resumeFlow;
exports.enqueueFlowTimeout = enqueueFlowTimeout;
exports.getQueueStats = getQueueStats;
exports.cleanOldJobs = cleanOldJobs;
const bull_1 = __importDefault(require("bull"));
const flowEngine_1 = require("../services/flowEngine");
const logger_1 = __importDefault(require("../utils/logger"));
// Configuração do Redis
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0'), // Database do Redis (0-15)
};
// Adiciona autenticação se configurada (opcional)
if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
}
if (process.env.REDIS_USERNAME) {
    redisConfig.username = process.env.REDIS_USERNAME;
}
// Cria a fila
logger_1.default.info('Initializing chatbot flow queue', { redis: redisConfig });
exports.flowQueue = new bull_1.default('chatbot-flows', {
    redis: redisConfig,
    defaultJobOptions: {
        attempts: 3, // Tenta até 3 vezes em caso de falha
        backoff: {
            type: 'exponential',
            delay: 5000, // 5 segundos de delay inicial, aumentando exponencialmente
        },
        removeOnComplete: false, // Mantém jobs completos para histórico
        removeOnFail: false, // Mantém jobs falhados para debugging
    },
});
logger_1.default.info('Chatbot flow queue created, setting up processor');
/**
 * Processa jobs da fila
 */
exports.flowQueue.process(async (job) => {
    const { flowId, conversationId, accountId, initialContext } = job.data;
    logger_1.default.info(`Processing flow job ${job.id}:`, {
        flowId,
        conversationId,
        accountId,
    });
    try {
        const flowEngine = new flowEngine_1.FlowEngine();
        await flowEngine.executeFlow(flowId, conversationId, accountId, initialContext);
        logger_1.default.info(`Flow job ${job.id} completed successfully`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error(`Flow job ${job.id} failed:`, error);
        throw error; // Bull vai tentar novamente baseado nas configurações
    }
});
logger_1.default.info('Flow queue processor registered successfully');
/**
 * Event listeners para monitoramento
 */
exports.flowQueue.on('completed', (job, result) => {
    logger_1.default.info(`Flow job ${job.id} completed:`, result);
});
exports.flowQueue.on('failed', (job, error) => {
    logger_1.default.error(`Flow job ${job?.id} failed permanently:`, error);
});
exports.flowQueue.on('stalled', (job) => {
    logger_1.default.warn(`Flow job ${job.id} stalled`);
});
exports.flowQueue.on('error', (error) => {
    logger_1.default.error('Flow queue error:', error);
});
exports.flowQueue.on('ready', () => {
    logger_1.default.info('Flow queue is ready and connected to Redis');
});
/**
 * Helper para adicionar job na fila
 */
async function enqueueFlow(flowId, conversationId, accountId, initialContext) {
    const job = await exports.flowQueue.add({
        flowId,
        conversationId,
        accountId,
        initialContext,
    });
    logger_1.default.info(`Flow enqueued: job ${job.id}, flow ${flowId}, conversation ${conversationId}`);
    return job;
}
/**
 * Retoma execução de flow que estava aguardando resposta
 */
async function resumeFlow(executionId, flowId, conversationId, accountId, context) {
    const job = await exports.flowQueue.add({
        flowId,
        conversationId,
        accountId,
        initialContext: {
            ...context,
            _resumeExecutionId: executionId,
        },
    });
    logger_1.default.info(`Flow resumed: job ${job.id}, execution ${executionId}`);
    return job;
}
/**
 * Agenda retomada automática por timeout (waitForResponse com timeout configurado)
 */
async function enqueueFlowTimeout(executionId, flowId, conversationId, accountId, timeoutSeconds) {
    const job = await exports.flowQueue.add({
        flowId,
        conversationId,
        accountId,
        initialContext: {
            _resumeExecutionId: executionId,
            _timedOut: true,
        },
    }, { delay: timeoutSeconds * 1000 });
    logger_1.default.info(`Flow timeout scheduled: job ${job.id}, execution ${executionId}, delay ${timeoutSeconds}s`);
    return job;
}
/**
 * Retorna estatísticas da fila
 */
async function getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
        exports.flowQueue.getWaitingCount(),
        exports.flowQueue.getActiveCount(),
        exports.flowQueue.getCompletedCount(),
        exports.flowQueue.getFailedCount(),
    ]);
    return {
        waiting,
        active,
        completed,
        failed,
    };
}
/**
 * Limpa jobs antigos da fila (manutenção)
 */
async function cleanOldJobs(olderThanDays = 7) {
    const timestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const [cleanedCompleted, cleanedFailed] = await Promise.all([
        exports.flowQueue.clean(timestamp, 'completed'),
        exports.flowQueue.clean(timestamp, 'failed'),
    ]);
    logger_1.default.info(`Cleaned ${cleanedCompleted.length} completed and ${cleanedFailed.length} failed jobs`);
    return { cleanedCompleted: cleanedCompleted.length, cleanedFailed: cleanedFailed.length };
}
//# sourceMappingURL=flowQueue.js.map