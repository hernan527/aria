import { ChatwootJWT } from '../types';
/**
 * Cria webhook global no Chatwoot (se não existir)
 * Chamado automaticamente ao criar o primeiro flow
 */
export declare function ensureGlobalWebhook(accountId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<string | null>;
/**
 * Remove webhook global do Chatwoot
 */
export declare function removeGlobalWebhook(accountId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<void>;
//# sourceMappingURL=globalWebhook.d.ts.map