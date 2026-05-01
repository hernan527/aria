import Bull from 'bull';
import { FlowJobData } from '../types';
export declare const flowQueue: Bull.Queue<FlowJobData>;
/**
 * Helper para adicionar job na fila
 */
export declare function enqueueFlow(flowId: number, conversationId: number, accountId: number, initialContext: Record<string, any>): Promise<Bull.Job<FlowJobData>>;
/**
 * Retoma execução de flow que estava aguardando resposta
 */
export declare function resumeFlow(executionId: number, flowId: number, conversationId: number, accountId: number, context: Record<string, any>): Promise<Bull.Job<FlowJobData>>;
/**
 * Agenda retomada automática por timeout (waitForResponse com timeout configurado)
 */
export declare function enqueueFlowTimeout(executionId: number, flowId: number, conversationId: number, accountId: number, timeoutSeconds: number): Promise<Bull.Job<FlowJobData>>;
/**
 * Retorna estatísticas da fila
 */
export declare function getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
}>;
/**
 * Limpa jobs antigos da fila (manutenção)
 */
export declare function cleanOldJobs(olderThanDays?: number): Promise<{
    cleanedCompleted: number;
    cleanedFailed: number;
}>;
//# sourceMappingURL=flowQueue.d.ts.map