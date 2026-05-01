"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUazapiInstance = createUazapiInstance;
exports.connectUazapiInstance = connectUazapiInstance;
exports.getUazapiInstanceStatus = getUazapiInstanceStatus;
exports.configureUazapiChatwoot = configureUazapiChatwoot;
exports.deleteUazapiInstance = deleteUazapiInstance;
exports.logoutUazapiInstance = logoutUazapiInstance;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Cria cliente Uazapi com configuração dinâmica
 */
function createUazapiClient(baseUrl, token, adminToken) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['token'] = token;
    }
    if (adminToken) {
        headers['admintoken'] = adminToken;
    }
    return axios_1.default.create({
        baseURL: baseUrl,
        headers,
    });
}
/**
 * Cria uma nova instância na Uazapi
 */
async function createUazapiInstance(config, instanceName, accountId, systemName) {
    try {
        logger_1.default.info('Creating Uazapi instance', { instanceName, accountId, baseUrl: config.baseUrl });
        const client = createUazapiClient(config.baseUrl, undefined, config.adminToken);
        const response = await client.post('/instance/init', {
            name: instanceName,
            systemName: systemName || `kanbancw-${accountId}`,
            adminField01: `account-${accountId}`,
            adminField02: instanceName,
        });
        logger_1.default.info('Uazapi instance created', {
            instanceName,
            token: response.data.instance?.token,
        });
        return response.data.instance;
    }
    catch (error) {
        const responseData = error.response?.data;
        const httpStatus = error.response?.status;
        logger_1.default.error('Failed to create Uazapi instance', {
            instanceName,
            error: error.message,
            httpStatus,
            response: responseData,
        });
        // HTTP 429 = limite de instâncias atingido
        if (httpStatus === 429 || responseData?.error?.toLowerCase().includes('maximum') || responseData?.error?.toLowerCase().includes('limit')) {
            throw new Error('Limite de instâncias Uazapi atingido, consulte seu provedor.');
        }
        const apiMessage = responseData?.message || responseData?.error || responseData?.info;
        throw new Error(apiMessage || 'Erro ao criar instância na Uazapi');
    }
}
/**
 * Conecta instância e obtém QR Code
 */
async function connectUazapiInstance(config, instanceToken) {
    try {
        logger_1.default.info('Connecting Uazapi instance', { baseUrl: config.baseUrl });
        const client = createUazapiClient(config.baseUrl, instanceToken);
        const response = await client.post('/instance/connect');
        logger_1.default.info('Uazapi instance connected, QR code generated');
        return {
            qrcode: response.data.instance?.qrcode || response.data.qrcode,
        };
    }
    catch (error) {
        const responseData = error.response?.data;
        const apiMessage = responseData?.message || responseData?.error || responseData?.msg;
        const httpStatus = error.response?.status;
        logger_1.default.error('Failed to connect Uazapi instance', {
            error: error.message,
            httpStatus,
            response: responseData,
        });
        // HTTP 429 = limite de instâncias atingido
        if (httpStatus === 429 || (apiMessage && /maximum|limit|reached/i.test(apiMessage))) {
            throw new Error('Limite de conexões Uazapi atingido. Remova uma instância existente ou entre em contato com seu provedor para ampliar o plano.');
        }
        throw new Error(apiMessage || 'Erro ao conectar instância Uazapi');
    }
}
/**
 * Busca status da instância
 */
async function getUazapiInstanceStatus(config, instanceToken) {
    try {
        logger_1.default.info('Getting Uazapi instance status', { baseUrl: config.baseUrl });
        const client = createUazapiClient(config.baseUrl, instanceToken);
        const response = await client.get('/instance/status');
        logger_1.default.info('Uazapi instance status retrieved', { status: response.data });
        return response.data;
    }
    catch (error) {
        logger_1.default.error('Failed to get Uazapi instance status', {
            error: error.message,
            response: error.response?.data,
        });
        throw new Error(error.response?.data?.message || 'Erro ao buscar status da instância');
    }
}
/**
 * Configura integração com Chatwoot
 */
async function configureUazapiChatwoot(config, instanceToken, chatwootConfig) {
    try {
        logger_1.default.info('Configuring Uazapi Chatwoot integration', {
            baseUrl: config.baseUrl,
            chatwootUrl: chatwootConfig.url,
            accountId: chatwootConfig.account_id,
            inboxId: chatwootConfig.inbox_id,
        });
        const client = createUazapiClient(config.baseUrl, instanceToken);
        const response = await client.put('/chatwoot/config', chatwootConfig);
        logger_1.default.info('Uazapi Chatwoot integration configured successfully');
        return response.data;
    }
    catch (error) {
        logger_1.default.error('Failed to configure Uazapi Chatwoot integration', {
            error: error.message,
            response: error.response?.data,
        });
        throw new Error(error.response?.data?.message || 'Erro ao configurar integração com Chatwoot');
    }
}
/**
 * Deleta instância
 */
async function deleteUazapiInstance(config, instanceToken) {
    try {
        logger_1.default.info('Deleting Uazapi instance', { baseUrl: config.baseUrl });
        const client = createUazapiClient(config.baseUrl, instanceToken);
        await client.delete('/instance/delete');
        logger_1.default.info('Uazapi instance deleted successfully');
    }
    catch (error) {
        logger_1.default.error('Failed to delete Uazapi instance', {
            error: error.message,
            response: error.response?.data,
        });
        throw new Error(error.response?.data?.message || 'Erro ao deletar instância');
    }
}
/**
 * Logout da instância
 */
async function logoutUazapiInstance(config, instanceToken) {
    try {
        logger_1.default.info('Logging out Uazapi instance', { baseUrl: config.baseUrl });
        const client = createUazapiClient(config.baseUrl, instanceToken);
        await client.post('/instance/logout');
        logger_1.default.info('Uazapi instance logged out successfully');
    }
    catch (error) {
        logger_1.default.error('Failed to logout Uazapi instance', {
            error: error.message,
            response: error.response?.data,
        });
        throw new Error(error.response?.data?.message || 'Erro ao fazer logout da instância');
    }
}
//# sourceMappingURL=uazapi.js.map