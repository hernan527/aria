import { ChatwootJWT } from '../types';
/**
 * Cria um Agent Bot específico para um flow
 * Retorna o ID do bot criado
 */
export declare function createAgentBotForFlow(flowId: number, flowName: string, accountId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<number>;
/**
 * Associa o Agent Bot a uma inbox específica
 */
export declare function associateBotToInbox(botId: number, accountId: number, inboxId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<void>;
/**
 * Remove a associação do Agent Bot de uma inbox
 */
export declare function disassociateBotFromInbox(accountId: number, inboxId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<void>;
/**
 * Deleta um Agent Bot do Chatwoot
 */
export declare function deleteAgentBot(botId: number, accountId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<void>;
/**
 * Gerencia o Agent Bot ao ativar um flow
 * Cria o bot e associa à inbox
 */
export declare function activateFlowBot(flowId: number, flowName: string, accountId: number, trigger: {
    type: string;
    value: string | number;
}, apiToken?: string, jwt?: ChatwootJWT): Promise<number | null>;
/**
 * Gerencia o Agent Bot ao desativar um flow
 * Remove associação da inbox e deleta o bot
 */
export declare function deactivateFlowBot(flowId: number, accountId: number, trigger: {
    type: string;
    value: string | number;
}, agentBotId: number | null, apiToken?: string, jwt?: ChatwootJWT): Promise<void>;
//# sourceMappingURL=chatwootAgentBot.d.ts.map