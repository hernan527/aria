"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateGlobalProviderSettings = exports.clearSettingsCache = exports.saveSystemSettings = exports.getSystemSettings = exports.decrypt = exports.encrypt = void 0;
const database_1 = __importDefault(require("./database"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("../utils/logger"));
// Cache em memória para evitar queries repetidas
const settingsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const cacheTimestamps = new Map();
/**
 * Chave de encriptação padrão (pode ser sobrescrita por variável de ambiente)
 */
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY || 'kanbancw-system-settings-key-32b';
    // Garantir que tenha exatamente 32 bytes
    return crypto_1.default.createHash('sha256').update(key).digest('hex').slice(0, 32);
};
/**
 * Criptografa um valor usando AES-256-CBC
 */
const encrypt = (text) => {
    if (!text)
        return '';
    const key = Buffer.from(getEncryptionKey(), 'utf8');
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Retorna: iv:encrypted
    return `${iv.toString('hex')}:${encrypted}`;
};
exports.encrypt = encrypt;
/**
 * Descriptografa um valor usando AES-256-CBC
 */
const decrypt = (text) => {
    if (!text)
        return '';
    try {
        const key = Buffer.from(getEncryptionKey(), 'utf8');
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        logger_1.default.error('Failed to decrypt value', { error });
        return '';
    }
};
exports.decrypt = decrypt;
/**
 * Busca as configurações de sistema para uma conta
 * Faz fallback para variáveis de ambiente se não encontrar no banco
 */
const getSystemSettings = async (accountId) => {
    try {
        // Verifica cache
        const cachedSettings = settingsCache.get(accountId);
        const cacheTime = cacheTimestamps.get(accountId);
        if (cachedSettings && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
            return cachedSettings;
        }
        // Busca do banco
        const settings = await database_1.default.systemSettings.findUnique({
            where: { accountId }
        });
        const result = {};
        if (settings) {
            // Descriptografa valores sensíveis do banco
            result.chatwootDatabaseUrl = settings.chatwootDatabaseUrl
                ? (0, exports.decrypt)(settings.chatwootDatabaseUrl)
                : undefined;
            result.chatwootPlatformToken = settings.chatwootPlatformToken
                ? (0, exports.decrypt)(settings.chatwootPlatformToken)
                : undefined;
            result.evolutionApiUrl = settings.evolutionApiUrl || undefined;
            result.evolutionApiKey = settings.evolutionApiKey
                ? (0, exports.decrypt)(settings.evolutionApiKey)
                : undefined;
            result.wahaApiUrl = settings.wahaApiUrl || undefined;
            result.wahaApiKey = settings.wahaApiKey
                ? (0, exports.decrypt)(settings.wahaApiKey)
                : undefined;
            result.uazapiBaseUrl = settings.uazapiBaseUrl || undefined;
            result.uazapiAdminToken = settings.uazapiAdminToken
                ? (0, exports.decrypt)(settings.uazapiAdminToken)
                : undefined;
            result.customEncryptionKey = settings.customEncryptionKey
                ? (0, exports.decrypt)(settings.customEncryptionKey)
                : undefined;
        }
        // Fallback para variáveis de ambiente (se não configurado no banco)
        result.chatwootDatabaseUrl = result.chatwootDatabaseUrl || process.env.CHATWOOT_DATABASE_URL;
        result.chatwootPlatformToken = result.chatwootPlatformToken || process.env.CHATWOOT_PLATFORM_API_TOKEN;
        result.evolutionApiUrl = result.evolutionApiUrl || process.env.EVOLUTION_API_URL;
        result.evolutionApiKey = result.evolutionApiKey || process.env.EVOLUTION_API_KEY;
        result.wahaApiUrl = result.wahaApiUrl || process.env.WAHA_API_URL;
        result.wahaApiKey = result.wahaApiKey || process.env.WAHA_API_KEY;
        result.uazapiBaseUrl = result.uazapiBaseUrl || process.env.UAZAPI_BASE_URL;
        result.uazapiAdminToken = result.uazapiAdminToken || process.env.UAZAPI_ADMIN_TOKEN;
        // Fallback global: se ainda não tem URLs de provider, busca o registro global (accountId=0)
        // Isso garante que configs salvas pelo SuperAdmin em Config Extra funcionem para TODAS as contas
        const needsGlobalFallback = accountId !== 0 && (!result.evolutionApiUrl || !result.wahaApiUrl || !result.uazapiBaseUrl);
        if (needsGlobalFallback) {
            const globalSettings = await database_1.default.systemSettings.findUnique({ where: { accountId: 0 } });
            if (globalSettings) {
                result.evolutionApiUrl = result.evolutionApiUrl || globalSettings.evolutionApiUrl || undefined;
                result.evolutionApiKey = result.evolutionApiKey || (globalSettings.evolutionApiKey ? (0, exports.decrypt)(globalSettings.evolutionApiKey) : undefined);
                result.wahaApiUrl = result.wahaApiUrl || globalSettings.wahaApiUrl || undefined;
                result.wahaApiKey = result.wahaApiKey || (globalSettings.wahaApiKey ? (0, exports.decrypt)(globalSettings.wahaApiKey) : undefined);
                result.uazapiBaseUrl = result.uazapiBaseUrl || globalSettings.uazapiBaseUrl || undefined;
                result.uazapiAdminToken = result.uazapiAdminToken || (globalSettings.uazapiAdminToken ? (0, exports.decrypt)(globalSettings.uazapiAdminToken) : undefined);
            }
        }
        // Atualiza cache
        settingsCache.set(accountId, result);
        cacheTimestamps.set(accountId, Date.now());
        return result;
    }
    catch (error) {
        logger_1.default.error('Failed to get system settings', { accountId, error });
        // Em caso de erro, retorna apenas variáveis de ambiente
        return {
            chatwootDatabaseUrl: process.env.CHATWOOT_DATABASE_URL,
            chatwootPlatformToken: process.env.CHATWOOT_PLATFORM_API_TOKEN,
            evolutionApiUrl: process.env.EVOLUTION_API_URL,
            evolutionApiKey: process.env.EVOLUTION_API_KEY,
            wahaApiUrl: process.env.WAHA_API_URL,
            wahaApiKey: process.env.WAHA_API_KEY,
            uazapiBaseUrl: process.env.UAZAPI_BASE_URL,
            uazapiAdminToken: process.env.UAZAPI_ADMIN_TOKEN,
        };
    }
};
exports.getSystemSettings = getSystemSettings;
/**
 * Salva ou atualiza as configurações de sistema para uma conta
 */
const saveSystemSettings = async (accountId, settings) => {
    try {
        const data = {};
        // Criptografa valores sensíveis antes de salvar
        if (settings.chatwootDatabaseUrl !== undefined) {
            data.chatwootDatabaseUrl = settings.chatwootDatabaseUrl
                ? (0, exports.encrypt)(settings.chatwootDatabaseUrl)
                : null;
        }
        if (settings.chatwootPlatformToken !== undefined) {
            data.chatwootPlatformToken = settings.chatwootPlatformToken
                ? (0, exports.encrypt)(settings.chatwootPlatformToken)
                : null;
        }
        if (settings.evolutionApiUrl !== undefined) {
            data.evolutionApiUrl = settings.evolutionApiUrl || null;
        }
        if (settings.evolutionApiKey !== undefined) {
            data.evolutionApiKey = settings.evolutionApiKey
                ? (0, exports.encrypt)(settings.evolutionApiKey)
                : null;
        }
        if (settings.wahaApiUrl !== undefined) {
            data.wahaApiUrl = settings.wahaApiUrl || null;
        }
        if (settings.wahaApiKey !== undefined) {
            data.wahaApiKey = settings.wahaApiKey
                ? (0, exports.encrypt)(settings.wahaApiKey)
                : null;
        }
        if (settings.uazapiBaseUrl !== undefined) {
            data.uazapiBaseUrl = settings.uazapiBaseUrl || null;
        }
        if (settings.uazapiAdminToken !== undefined) {
            data.uazapiAdminToken = settings.uazapiAdminToken
                ? (0, exports.encrypt)(settings.uazapiAdminToken)
                : null;
        }
        if (settings.customEncryptionKey !== undefined) {
            data.customEncryptionKey = settings.customEncryptionKey
                ? (0, exports.encrypt)(settings.customEncryptionKey)
                : null;
        }
        // Upsert no banco
        await database_1.default.systemSettings.upsert({
            where: { accountId },
            create: { accountId, ...data },
            update: data
        });
        // Limpa cache
        settingsCache.delete(accountId);
        cacheTimestamps.delete(accountId);
        logger_1.default.info('System settings saved', { accountId });
    }
    catch (error) {
        logger_1.default.error('Failed to save system settings', { accountId, error });
        throw error;
    }
};
exports.saveSystemSettings = saveSystemSettings;
/**
 * Limpa o cache de configurações para uma conta
 */
const clearSettingsCache = (accountId) => {
    settingsCache.delete(accountId);
    cacheTimestamps.delete(accountId);
};
exports.clearSettingsCache = clearSettingsCache;
/**
 * Migração de startup: copia as URLs de provider da conta 1 (SuperAdmin) para o
 * registro global (accountId=0) se este ainda não existir.
 * Isso garante que instalações existentes (0.0.6) continuem funcionando sem
 * exigir que o SuperAdmin re-salve em Config Extra.
 */
const migrateGlobalProviderSettings = async () => {
    try {
        const globalExists = await database_1.default.systemSettings.findUnique({ where: { accountId: 0 } });
        if (globalExists)
            return; // Já migrado
        // Busca a primeira conta com URLs de provider configuradas
        const firstWithSettings = await database_1.default.systemSettings.findFirst({
            where: {
                accountId: { gt: 0 },
                OR: [
                    { evolutionApiUrl: { not: null } },
                    { wahaApiUrl: { not: null } },
                    { uazapiBaseUrl: { not: null } },
                ]
            },
            orderBy: { accountId: 'asc' }
        });
        if (!firstWithSettings)
            return; // Nenhuma conta configurada ainda
        await database_1.default.systemSettings.create({
            data: {
                accountId: 0,
                evolutionApiUrl: firstWithSettings.evolutionApiUrl,
                evolutionApiKey: firstWithSettings.evolutionApiKey,
                wahaApiUrl: firstWithSettings.wahaApiUrl,
                wahaApiKey: firstWithSettings.wahaApiKey,
                uazapiBaseUrl: firstWithSettings.uazapiBaseUrl,
                uazapiAdminToken: firstWithSettings.uazapiAdminToken,
            }
        });
        logger_1.default.info('Global provider settings migrated', {
            sourceAccountId: firstWithSettings.accountId,
            hasEvolution: !!firstWithSettings.evolutionApiUrl,
            hasWaha: !!firstWithSettings.wahaApiUrl,
            hasUazapi: !!firstWithSettings.uazapiBaseUrl,
        });
    }
    catch (error) {
        logger_1.default.error('Failed to migrate global provider settings', { error });
    }
};
exports.migrateGlobalProviderSettings = migrateGlobalProviderSettings;
//# sourceMappingURL=systemSettings.js.map