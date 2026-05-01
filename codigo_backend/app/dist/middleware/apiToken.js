"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateApiToken = authenticateApiToken;
exports.requirePermission = requirePermission;
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const chatwootDatabase_1 = __importDefault(require("../services/chatwootDatabase"));
/**
 * Middleware para autenticar requisições usando API Token
 * Header: Authorization: Bearer <token>
 */
async function authenticateApiToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'API token missing or invalid' });
        return;
    }
    const token = authHeader.substring(7); // Remove "Bearer "
    try {
        const apiToken = await database_1.default.apiToken.findUnique({
            where: { token },
        });
        if (!apiToken || !apiToken.isActive) {
            res.status(401).json({ error: 'Invalid or inactive API token' });
            return;
        }
        // Verifica expiração
        if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
            res.status(401).json({ error: 'API token expired' });
            return;
        }
        // Parse permissions
        let permissions = [];
        try {
            permissions = JSON.parse(apiToken.permissions);
        }
        catch {
            permissions = [];
        }
        // Atualiza lastUsedAt de forma assíncrona (fire-and-forget) para não adicionar latência à requisição.
        // Erros são logados mas não bloqueiam o fluxo de autenticação.
        database_1.default.apiToken
            .update({
            where: { id: apiToken.id },
            data: { lastUsedAt: new Date() },
        })
            .catch((err) => logger_1.default.error('Failed to update token lastUsedAt', { error: err }));
        // Suporte a X-Account-ID: permite que SuperAdmins (ou usuários multi-conta)
        // especifiquem qual empresa querem operar via header, sem criar tokens por conta.
        let effectiveAccountId = apiToken.accountId;
        const xAccountIdHeader = req.headers['x-account-id'];
        if (xAccountIdHeader) {
            const requestedAccountId = parseInt(xAccountIdHeader, 10);
            if (!isNaN(requestedAccountId) && requestedAccountId !== apiToken.accountId) {
                try {
                    const hasAccess = await chatwootDatabase_1.default.canUserAccessAccount(apiToken.userId, requestedAccountId);
                    if (hasAccess) {
                        effectiveAccountId = requestedAccountId;
                        logger_1.default.info('API token: X-Account-ID applied', {
                            tokenId: apiToken.id,
                            originalAccountId: apiToken.accountId,
                            effectiveAccountId,
                            userId: apiToken.userId,
                        });
                    }
                    else {
                        res.status(403).json({
                            error: 'Acesso negado à conta solicitada',
                            code: 'ACCOUNT_ACCESS_DENIED',
                        });
                        return;
                    }
                }
                catch (accessErr) {
                    logger_1.default.warn('API token: Failed to verify X-Account-ID access, using token account', {
                        tokenId: apiToken.id,
                        requestedAccountId,
                        error: accessErr,
                    });
                    // fail-open: usa a conta do token em caso de erro no DB do Chatwoot
                }
            }
        }
        // Anexa dados do token à requisição
        req.apiTokenData = {
            id: apiToken.id,
            accountId: effectiveAccountId,
            userId: apiToken.userId,
            permissions,
        };
        logger_1.default.info('API token authenticated', {
            tokenId: apiToken.id,
            accountId: effectiveAccountId,
            userId: apiToken.userId,
        });
        next();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('API token authentication error', { error: errorMessage });
        res.status(500).json({ error: 'Authentication failed' });
    }
}
/**
 * Middleware para verificar se o token tem uma permissão específica
 */
function requirePermission(permission) {
    return (req, res, next) => {
        const apiReq = req;
        if (!apiReq.apiTokenData) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const hasPermission = apiReq.apiTokenData.permissions.includes('*') || // Permissão total
            apiReq.apiTokenData.permissions.includes(permission);
        if (!hasPermission) {
            res.status(403).json({
                error: 'Insufficient permissions',
                required: permission,
                available: apiReq.apiTokenData.permissions,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=apiToken.js.map