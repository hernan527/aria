"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAuth = validateAuth;
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Resolve o account_id efetivo para a requisição e atualiza user.role para a conta correta.
 * Se o header X-Account-ID estiver presente, valida se o usuário tem acesso:
 *   - SuperAdmins (type === 'SuperAdmin') têm acesso a qualquer conta
 *   - Demais usuários só podem acessar contas às quais pertencem
 * Retorna null se o acesso for negado.
 */
function resolveAccountId(req, user) {
    const requestedHeader = req.headers['x-account-id'];
    if (!requestedHeader)
        return user.account_id; // sem header → conta padrão
    const requestedId = parseInt(requestedHeader, 10);
    if (isNaN(requestedId))
        return user.account_id; // header inválido → ignora
    // SuperAdmin pode operar em qualquer conta (sem restrição de role)
    if (user.type === 'SuperAdmin')
        return requestedId;
    // Usuário regular: verificar se pertence à conta solicitada
    const accountEntry = (user.accounts || []).find(a => a.account_id === requestedId);
    if (!accountEntry) {
        logger_1.default.warn('X-Account-ID access denied', { userId: user.id, requestedId, userAccounts: user.accounts });
        return null; // acesso negado
    }
    // Atualiza role para refletir o papel do usuário na conta efetiva
    user.role = accountEntry.role;
    return requestedId;
}
async function validateAuth(req, res, next) {
    // Log headers para debug
    logger_1.default.info('Auth headers received', {
        path: req.path,
        hasApiToken: !!req.headers['api_access_token'],
        hasAccessToken: !!req.headers['access-token'],
        hasClient: !!req.headers['client'],
        hasUid: !!req.headers['uid']
    });
    // Verifica API access token primeiro
    const apiAccessToken = req.headers['api_access_token'];
    if (apiAccessToken) {
        try {
            const user = await chatwoot_1.default.validateAPIToken(apiAccessToken);
            if (!user) {
                return res.status(401).json({ error: 'Invalid API token' });
            }
            const authReq = req;
            authReq.user = user;
            authReq.apiToken = apiAccessToken;
            authReq.jwt = {
                'access-token': '',
                'token-type': 'Bearer',
                client: '',
                expiry: '',
                uid: ''
            };
            // Suporte a X-Account-ID: permite especificar conta ao operar via API
            const resolvedAccountId = resolveAccountId(req, user);
            if (resolvedAccountId === null) {
                return res.status(403).json({ error: 'Acesso negado à conta solicitada', code: 'ACCOUNT_ACCESS_DENIED' });
            }
            authReq.accountId = resolvedAccountId;
            authReq.userId = user.id;
            authReq.user.account_id = resolvedAccountId;
            logger_1.default.info('Authenticated with API token', { userId: user.id, accountId: resolvedAccountId, path: req.path });
            return next();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('API token validation error', { error: errorMessage });
            return res.status(401).json({ error: 'Authentication failed' });
        }
    }
    // Verifica JWT headers
    const accessToken = req.headers['access-token'];
    const tokenType = req.headers['token-type'];
    const client = req.headers['client'];
    const expiry = req.headers['expiry'];
    const uid = req.headers['uid'];
    if (!accessToken || !client || !uid) {
        logger_1.default.warn('Missing authentication', { path: req.path });
        return res.status(401).json({
            error: 'Missing authentication headers',
            required: ['access-token', 'client', 'uid']
        });
    }
    const jwt = {
        'access-token': accessToken,
        'token-type': tokenType || 'Bearer',
        client,
        expiry,
        uid,
    };
    try {
        const user = await chatwoot_1.default.validateJWT(jwt);
        if (!user) {
            return res.status(401).json({
                error: 'Invalid or expired JWT',
                code: 'JWT_EXPIRED',
                message: 'Sua sessão expirou. Por favor, recarregue a página para fazer login novamente.'
            });
        }
        const authReq = req;
        authReq.user = user;
        authReq.jwt = jwt;
        authReq.apiToken = undefined;
        // Suporte a X-Account-ID
        const resolvedAccountId = resolveAccountId(req, user);
        if (resolvedAccountId === null) {
            return res.status(403).json({ error: 'Acesso negado à conta solicitada', code: 'ACCOUNT_ACCESS_DENIED' });
        }
        authReq.accountId = resolvedAccountId;
        authReq.userId = user.id;
        authReq.user.account_id = resolvedAccountId;
        logger_1.default.info('Authenticated with JWT', { userId: user.id, accountId: resolvedAccountId, path: req.path });
        next();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('JWT validation failed', {
            error: errorMessage,
            path: req.path,
            method: req.method,
            uid: jwt.uid,
            timestamp: new Date().toISOString()
        });
        return res.status(401).json({
            error: 'Authentication failed',
            code: 'AUTH_FAILED',
            message: 'Falha na autenticação. Por favor, recarregue a página.'
        });
    }
}
//# sourceMappingURL=auth.js.map