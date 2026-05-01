"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Cliente PostgreSQL para consultas READ-ONLY no banco do Chatwoot
 * Usado apenas para validação de JWT sem sobrecarregar a API
 */
class ChatwootDatabase {
    connectionString;
    constructor() {
        this.connectionString = process.env.CHATWOOT_DATABASE_URL || '';
        if (!this.connectionString) {
            logger_1.default.warn('CHATWOOT_DATABASE_URL not configured - JWT validation will use API fallback');
        }
    }
    /**
     * Valida JWT consultando diretamente a tabela users do Chatwoot
     * Muito mais rápido que fazer HTTP request para /api/v1/profile
     */
    async validateJWTDirect(accessToken, client, uid) {
        if (!this.connectionString) {
            logger_1.default.warn('Cannot validate JWT directly - no database connection');
            return null;
        }
        const pgClient = new pg_1.Client({ connectionString: this.connectionString });
        try {
            await pgClient.connect();
            // Consulta a tabela users do Chatwoot + TODAS as contas do usuário
            const query = `
        SELECT
          u.id,
          u.email as uid,
          u.name,
          u.type,
          u.custom_attributes,
          json_agg(json_build_object('account_id', acu.account_id, 'role', acu.role) ORDER BY acu.account_id ASC) as accounts
        FROM users u
        LEFT JOIN account_users acu ON acu.user_id = u.id
        WHERE u.email = $1
          AND u.tokens IS NOT NULL
        GROUP BY u.id, u.email, u.name, u.type, u.custom_attributes
        LIMIT 1
      `;
            const result = await pgClient.query(query, [uid]);
            if (result.rows.length === 0) {
                logger_1.default.info('JWT validation: user not found in database', { uid });
                return null;
            }
            const user = result.rows[0];
            const accounts = (user.accounts || [])
                .filter((a) => a.account_id !== null)
                .map((a) => ({ account_id: parseInt(a.account_id, 10), role: a.role }));
            const firstAccount = accounts[0];
            // SuperAdmin sem account_users: retorna null para forçar fallback via API
            // (preserva comportamento 0.0.7 com INNER JOIN que retornava null nesse caso)
            if ((user.type === 'SuperAdmin') && accounts.length === 0) {
                logger_1.default.info('SuperAdmin with no account_users — falling back to API for correct account_id', { uid: user.uid });
                return null;
            }
            logger_1.default.info('JWT validated via database', {
                userId: user.id,
                uid: user.uid,
                type: user.type,
                accountCount: accounts.length,
                method: 'database_direct'
            });
            return {
                id: parseInt(user.id, 10),
                uid: user.uid,
                email: user.uid,
                name: user.name,
                type: user.type || null,
                account_id: firstAccount ? firstAccount.account_id : 0,
                role: firstAccount ? firstAccount.role : 'agent',
                accounts,
                custom_attributes: user.custom_attributes
            };
        }
        catch (error) {
            logger_1.default.error('Failed to validate JWT via database', {
                error: error.message,
                uid
            });
            return null;
        }
        finally {
            await pgClient.end();
        }
    }
    /**
     * Valida API token consultando diretamente a tabela access_tokens do Chatwoot
     */
    async validateAPITokenDirect(apiToken) {
        if (!this.connectionString) {
            logger_1.default.warn('Cannot validate API token directly - no database connection');
            return null;
        }
        const pgClient = new pg_1.Client({ connectionString: this.connectionString });
        try {
            await pgClient.connect();
            // Consulta a tabela access_tokens + TODAS as contas do usuário
            const query = `
        SELECT
          u.id,
          u.email as uid,
          u.name,
          u.type,
          u.custom_attributes,
          json_agg(json_build_object('account_id', acu.account_id, 'role', acu.role) ORDER BY acu.account_id ASC) as accounts
        FROM access_tokens at
        INNER JOIN users u ON u.id = at.owner_id
        LEFT JOIN account_users acu ON acu.user_id = u.id
        WHERE at.token = $1
          AND at.owner_type = 'User'
        GROUP BY u.id, u.email, u.name, u.type, u.custom_attributes
        LIMIT 1
      `;
            const result = await pgClient.query(query, [apiToken]);
            if (result.rows.length === 0) {
                logger_1.default.info('API token validation: token not found in database');
                return null;
            }
            const user = result.rows[0];
            const accounts = (user.accounts || [])
                .filter((a) => a.account_id !== null)
                .map((a) => ({ account_id: parseInt(a.account_id, 10), role: a.role }));
            const firstAccount = accounts[0];
            // SuperAdmin sem account_users: retorna null para forçar fallback via API
            if ((user.type === 'SuperAdmin') && accounts.length === 0) {
                logger_1.default.info('SuperAdmin with no account_users (API token) — falling back to API for correct account_id', { userId: user.id });
                return null;
            }
            logger_1.default.info('API token validated via database', {
                userId: user.id,
                type: user.type,
                accountCount: accounts.length,
                method: 'database_direct'
            });
            return {
                id: parseInt(user.id, 10),
                uid: user.uid,
                email: user.uid,
                name: user.name,
                type: user.type || null,
                account_id: firstAccount ? firstAccount.account_id : 0,
                role: firstAccount ? firstAccount.role : 'agent',
                accounts,
                custom_attributes: user.custom_attributes
            };
        }
        catch (error) {
            logger_1.default.error('Failed to validate API token via database', {
                error: error.message
            });
            return null;
        }
        finally {
            await pgClient.end();
        }
    }
    /**
     * Busca o access_token do Chatwoot de um usuário pelo seu ID
     * Usado para autenticar chamadas API em nome do usuário
     */
    async getUserAccessToken(userId) {
        if (!this.connectionString) {
            logger_1.default.warn('Cannot get user access token - no database connection');
            return null;
        }
        const pgClient = new pg_1.Client({ connectionString: this.connectionString });
        try {
            await pgClient.connect();
            const query = `
        SELECT at.token
        FROM access_tokens at
        WHERE at.owner_id = $1
          AND at.owner_type = 'User'
        ORDER BY at.created_at DESC
        LIMIT 1
      `;
            const result = await pgClient.query(query, [userId]);
            if (result.rows.length === 0) {
                logger_1.default.warn('No access token found for user', { userId });
                return null;
            }
            return result.rows[0].token;
        }
        catch (error) {
            logger_1.default.error('Failed to get user access token from database', {
                error: error.message,
                userId
            });
            return null;
        }
        finally {
            await pgClient.end();
        }
    }
    /**
     * Verifica se um usuário Chatwoot tem acesso a uma conta específica.
     * SuperAdmins têm acesso a qualquer conta; demais precisam estar em account_users.
     * Usado para validar X-Account-ID no middleware de API token.
     */
    async canUserAccessAccount(chatwootUserId, accountId) {
        if (!this.connectionString) {
            // Lança exceção para que o caller possa fazer fail-open (usar conta do token)
            // em vez de bloquear a requisição com 403
            throw new Error('CHATWOOT_DATABASE_URL not configured — cannot verify account access');
        }
        const pgClient = new pg_1.Client({ connectionString: this.connectionString });
        try {
            await pgClient.connect();
            const query = `
        SELECT u.type, acu.account_id as has_account
        FROM users u
        LEFT JOIN account_users acu ON acu.user_id = u.id AND acu.account_id = $2
        WHERE u.id = $1
        LIMIT 1
      `;
            const result = await pgClient.query(query, [chatwootUserId, accountId]);
            if (result.rows.length === 0)
                return false;
            const row = result.rows[0];
            // SuperAdmin pode acessar qualquer conta
            if (row.type === 'SuperAdmin')
                return true;
            // Usuário regular: precisa ter entrada em account_users
            return row.has_account !== null;
        }
        catch (error) {
            logger_1.default.error('Failed to check account access', { error: error.message, chatwootUserId, accountId });
            return false;
        }
        finally {
            await pgClient.end();
        }
    }
    /**
     * Busca conversas de um contato diretamente no banco do Chatwoot
     */
    async getContactConversations(accountId, contactId) {
        if (!this.connectionString) {
            logger_1.default.warn('Cannot get contact conversations - no database connection');
            return [];
        }
        const pgClient = new pg_1.Client({ connectionString: this.connectionString });
        try {
            await pgClient.connect();
            const query = `
        SELECT c.id
        FROM conversations c
        WHERE c.account_id = $1
          AND c.contact_id = $2
        ORDER BY c.created_at DESC
      `;
            const result = await pgClient.query(query, [accountId, contactId]);
            return result.rows.map((row) => ({ id: parseInt(row.id, 10) }));
        }
        catch (error) {
            logger_1.default.error('Failed to get contact conversations from database', {
                error: error.message,
                accountId,
                contactId
            });
            return [];
        }
        finally {
            await pgClient.end();
        }
    }
}
exports.default = new ChatwootDatabase();
//# sourceMappingURL=chatwootDatabase.js.map