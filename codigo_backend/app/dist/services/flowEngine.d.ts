import { FlowExecutionContext } from '../types';
import { Server as SocketIOServer } from 'socket.io';
export declare function setFlowEngineSocketIO(socketIO: SocketIOServer): void;
/**
 * Engine de execução de flows de chatbot
 */
export declare class FlowEngine {
    private readonly MAX_DEPTH;
    private readonly MAX_EXECUTION_TIME;
    private readonly botToken;
    constructor();
    /**
     * Busca o bot token para uma conta (do flow creator ou fallback para SystemSettings/env)
     */
    private getBotToken;
    /**
     * Busca o access token de um usuário diretamente do banco do Chatwoot
     */
    private getUserTokenFromChatwootDb;
    /**
     * Executa um flow completo
     */
    executeFlow(flowId: number, conversationId: number, accountId: number, initialContext?: FlowExecutionContext): Promise<void>;
    /**
     * Processa um node individual
     */
    private processNode;
    /**
     * Determina o próximo node baseado nas edges
     */
    private getNextNode;
    /**
     * Substitui variáveis no texto
     */
    private replaceVariables;
    /**
     * Executa node: sendWATemplate
     * Envia um template de WhatsApp via Chatwoot API
     */
    private executeSendWATemplate;
    /**
     * Executa node: sendText
     */
    private executeSendText;
    /**
     * Executa node: sendImage
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
     * Avalia condição - suporta tanto expressões matemáticas quanto operações de string
     */
    private evaluateCondition;
    /**
     * Verifica se é uma condição de string (contém métodos JavaScript)
     */
    private isStringCondition;
    /**
     * Avalia condição de string de forma segura
     */
    private evaluateStringCondition;
    /**
     * Avalia um switch node e retorna o índice do case que corresponder
     */
    private evaluateSwitch;
    /**
     * Executa node: delay
     * Suporta modo fixo (seconds) e modo range aleatório (minSeconds, maxSeconds)
     */
    private executeDelay;
    /**
     * Executa node: changeStatus
     */
    private executeChangeStatus;
    /**
     * Executa node: labels (add ou remove)
     */
    private executeLabels;
    /**
     * Executa node: assign (agent ou team)
     */
    private executeAssign;
    /**
     * Executa node: aiAgent (OpenAI ou Groq)
     */
    private executeAIAgent;
    /**
     * Busca conteúdo das bases de conhecimento
     */
    private getKnowledgeBaseContext;
    /**
     * Executa node: httpRequest (dispara webhook externo)
     */
    private executeHttpRequest;
    /**
     * Salva estado da execução no banco
     */
    private saveExecutionState;
}
//# sourceMappingURL=flowEngine.d.ts.map