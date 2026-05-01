"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkResourcePermission = checkResourcePermission;
exports.checkAnyResourcePermission = checkAnyResourcePermission;
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Middleware para verificar se o usuário tem permissão para acessar um recurso específico
 *
 * Lógica de verificação em 2 níveis:
 * 1. Nível de Empresa (AccountPermissions): Se desabilitado, TODOS os usuários são bloqueados
 * 2. Nível de Usuário (UserResourcePermission): Controle granular por usuário
 *
 * Uso:
 * router.get('/conexoes', validateAuth, checkResourcePermission('conexoesAccess'), conexoesRouter);
 */
/**
 * Executa a verificação de permissão e retorna o resultado.
 * Separado para permitir retry no middleware.
 */
async function runPermissionCheck(userId, accountId, resourceKey) {
    const accountPermissionMap = {
        'kanbanAccess': 'kanbanEnabled',
        'conexoesAccess': 'conexoesEnabled',
        'chatsInternosAccess': 'chatsInternosEnabled',
        'projectsAccess': 'projectsEnabled',
        'chatbotFlowsAccess': 'chatbotFlowsEnabled'
    };
    // 1. PRIMEIRO: Verificar permissões em nível de EMPRESA
    const accountPermField = accountPermissionMap[resourceKey];
    if (accountPermField) {
        const accountPermissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId }
        });
        if (accountPermissions && accountPermissions[accountPermField] === false) {
            return 'deny-account';
        }
    }
    // 2. SEGUNDO: Verificar permissões em nível de USUÁRIO
    const userPermissions = await database_1.default.userResourcePermission.findUnique({
        where: { accountId_userId: { accountId, userId } }
    });
    const hasPermission = userPermissions
        ? userPermissions[resourceKey] === true
        : true; // Default: permite (admin pode restringir explicitamente)
    return hasPermission ? 'allow' : 'deny-user';
}
function checkResourcePermission(resourceKey) {
    return async (req, res, next) => {
        const userId = req.userId;
        const accountId = req.accountId;
        if (!userId || !accountId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        let result;
        try {
            result = await runPermissionCheck(userId, accountId, resourceKey);
        }
        catch (firstError) {
            // Retry uma vez após breve pausa (erros transitórios de conexão com o banco)
            logger_1.default.warn('Error checking resource permission, retrying...', { resourceKey, error: firstError });
            try {
                await new Promise(resolve => setTimeout(resolve, 150));
                result = await runPermissionCheck(userId, accountId, resourceKey);
            }
            catch (retryError) {
                logger_1.default.error('Error checking resource permission after retry — denying access (fail-closed)', { resourceKey, error: retryError });
                return res.status(503).json({
                    success: false,
                    error: 'Service temporarily unavailable',
                    message: 'Não foi possível verificar permissões. Tente novamente em instantes.'
                });
            }
        }
        if (result === 'deny-account') {
            logger_1.default.warn('Access denied - resource disabled at account level', { userId, accountId, resource: resourceKey, path: req.path });
            return res.status(403).json({
                success: false,
                error: 'This resource is disabled for your organization',
                message: 'Este recurso está desabilitado para sua empresa'
            });
        }
        if (result === 'deny-user') {
            logger_1.default.warn('User access denied - insufficient user permissions', { userId, accountId, resource: resourceKey, path: req.path });
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this resource',
                message: 'Você não tem permissão para acessar este recurso'
            });
        }
        next();
    };
}
/**
 * Middleware para verificar múltiplos recursos (OR - basta ter 1)
 */
function checkAnyResourcePermission(...resourceKeys) {
    return async (req, res, next) => {
        const userId = req.userId;
        const accountId = req.accountId;
        if (!userId || !accountId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        async function runCheck() {
            const userPermissions = await database_1.default.userResourcePermission.findUnique({
                where: { accountId_userId: { accountId, userId } }
            });
            return resourceKeys.some(key => userPermissions ? userPermissions[key] === true : false);
        }
        let hasAnyPermission;
        try {
            hasAnyPermission = await runCheck();
        }
        catch (firstError) {
            logger_1.default.warn('Error checking any resource permissions, retrying...', { resourceKeys, error: firstError });
            try {
                await new Promise(resolve => setTimeout(resolve, 150));
                hasAnyPermission = await runCheck();
            }
            catch (retryError) {
                logger_1.default.error('Error checking resource permissions after retry — denying access (fail-closed)', { resourceKeys, error: retryError });
                return res.status(503).json({
                    success: false,
                    error: 'Service temporarily unavailable',
                    message: 'Não foi possível verificar permissões. Tente novamente em instantes.'
                });
            }
        }
        if (!hasAnyPermission) {
            logger_1.default.warn('User access denied - insufficient permissions (any)', { userId, accountId, resources: resourceKeys, path: req.path });
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this resource'
            });
        }
        next();
    };
}
//# sourceMappingURL=checkResourcePermission.js.map