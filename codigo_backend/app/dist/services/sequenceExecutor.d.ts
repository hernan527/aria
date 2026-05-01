import { FlowExecutionContext } from '../types';
import { Server as SocketIOServer } from 'socket.io';
export declare function setSequenceExecutorSocketIO(socketIO: SocketIOServer): void;
/**
 * Executor de sequências assíncronas
 * Processa flows do tipo "sequence" ao longo do tempo
 */
export declare class SequenceExecutor {
    private readonly botToken;
    constructor();
    /**
     * Inicia uma nova sequência para um contato
     */
    startSequence(flowId: number, contactId: number, accountId: number, conversationId?: number, initialContext?: FlowExecutionContext, jwt?: any, apiToken?: string): Promise<number>;
    /**
     * Processa uma execução específica
     * Executa o próximo node da sequência
     */
    processExecution(executionId: number): Promise<void>;
    /**
     * Executa um node específico
     */
    private executeNode;
    /**
     * Processa steps agendados
     * Chamado pelo scheduler a cada minuto
     */
    processScheduledSteps(): Promise<void>;
    /**
     * Encontra o próximo node a ser executado
     */
    private findNextNode;
    /**
     * Parse de delay em milissegundos
     */
    private parseDelay;
    /**
     * Executa node sendText
     */
    private executeSendText;
    /**
     * Executa node sendImage
     */
    private executeSendImage;
    /**
     * Executa node sendVideo
     */
    private executeSendVideo;
    /**
     * Executa node sendFile
     */
    private executeSendFile;
    /**
     * Executa node sendWATemplate (WhatsApp Oficial template)
     */
    private executeSendWATemplate;
    /**
     * Executa node changeStatus
     */
    private executeChangeStatus;
    /**
     * Executa node labels
     */
    private executeLabels;
    /**
     * Executa node assign
     */
    private executeAssign;
    /**
     * Substitui variáveis no texto
     */
    private replaceVariables;
    /**
     * Completa uma sequência
     */
    private completeSequence;
    /**
     * Pausa uma sequência
     */
    pauseSequence(executionId: number): Promise<void>;
    /**
     * Retoma uma sequência pausada
     */
    resumeSequence(executionId: number): Promise<void>;
    /**
     * Retoma execução após waitForResponse com a resposta do usuário
     */
    resumeExecution(executionId: number, additionalContext?: FlowExecutionContext): Promise<void>;
    /**
     * Cancela uma sequência
     */
    cancelSequence(executionId: number): Promise<void>;
}
declare const _default: SequenceExecutor;
export default _default;
//# sourceMappingURL=sequenceExecutor.d.ts.map