/**
 * Cliente PostgreSQL para consultas READ-ONLY no banco do Chatwoot
 * Usado apenas para validação de JWT sem sobrecarregar a API
 */
declare class ChatwootDatabase {
    private connectionString;
    constructor();
    /**
     * Valida JWT consultando diretamente a tabela users do Chatwoot
     * Muito mais rápido que fazer HTTP request para /api/v1/profile
     */
    validateJWTDirect(accessToken: string, client: string, uid: string): Promise<any | null>;
    /**
     * Valida API token consultando diretamente a tabela access_tokens do Chatwoot
     */
    validateAPITokenDirect(apiToken: string): Promise<any | null>;
    /**
     * Busca o access_token do Chatwoot de um usuário pelo seu ID
     * Usado para autenticar chamadas API em nome do usuário
     */
    getUserAccessToken(userId: number): Promise<string | null>;
    /**
     * Verifica se um usuário Chatwoot tem acesso a uma conta específica.
     * SuperAdmins têm acesso a qualquer conta; demais precisam estar em account_users.
     * Usado para validar X-Account-ID no middleware de API token.
     */
    canUserAccessAccount(chatwootUserId: number, accountId: number): Promise<boolean>;
    /**
     * Busca conversas de um contato diretamente no banco do Chatwoot
     */
    getContactConversations(accountId: number, contactId: number): Promise<{
        id: number;
    }[]>;
}
declare const _default: ChatwootDatabase;
export default _default;
//# sourceMappingURL=chatwootDatabase.d.ts.map