"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWahaSession = createWahaSession;
exports.createWahaChatwootApp = createWahaChatwootApp;
exports.getWahaAppId = getWahaAppId;
exports.fetchWahaSessions = fetchWahaSessions;
exports.getWahaSessionStatus = getWahaSessionStatus;
exports.deleteWahaSession = deleteWahaSession;
exports.logoutWahaSession = logoutWahaSession;
exports.restartWahaSession = restartWahaSession;
exports.updateWahaSessionConfig = updateWahaSessionConfig;
exports.createWahaCallsApp = createWahaCallsApp;
exports.updateWahaCallsApp = updateWahaCallsApp;
exports.getWahaSessionConfig = getWahaSessionConfig;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const systemSettings_1 = require("./systemSettings");
/**
 * Cria um cliente Waha configurado com as credenciais da conta
 */
async function getWahaClient(accountId) {
    const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
    const baseURL = settings.wahaApiUrl || process.env.WAHA_API_URL || '';
    const apiKey = settings.wahaApiKey || process.env.WAHA_API_KEY || '';
    return axios_1.default.create({
        baseURL,
        headers: {
            'X-Api-Key': apiKey,
        },
    });
}
// Cliente global para funções que ainda não foram migradas
const WAHA_API_URL = process.env.WAHA_API_URL || '';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';
const wahaClient = axios_1.default.create({
    baseURL: WAHA_API_URL,
    headers: {
        'X-Api-Key': WAHA_API_KEY,
    },
});
/**
 * Cria uma nova sessão (instância) na Waha
 * Se a sessão já existe, retorna a sessão existente
 */
async function createWahaSession(accountId, instanceName) {
    const wahaClient = await getWahaClient(accountId);
    const sessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
    try {
        logger_1.default.info('Creating Waha session', { sessionName, instanceName, accountId });
        const response = await wahaClient.post('/api/sessions', {
            name: sessionName,
            start: true,
            config: {},
        });
        logger_1.default.info('Waha session created', {
            sessionName,
            status: response.status,
            data: response.data,
        });
        return response.data;
    }
    catch (error) {
        // Se a sessão já existe (422), busca a sessão existente
        if (error.response?.status === 422 && error.response?.data?.message?.includes('already exists')) {
            logger_1.default.info('Waha session already exists, fetching existing session', { sessionName });
            try {
                const existingSession = await wahaClient.get(`/api/sessions/${sessionName}`);
                logger_1.default.info('Existing Waha session fetched', { sessionName, data: existingSession.data });
                return existingSession.data;
            }
            catch (fetchError) {
                logger_1.default.error('Failed to fetch existing Waha session', {
                    sessionName,
                    error: fetchError.message,
                });
                throw fetchError;
            }
        }
        logger_1.default.error('Failed to create Waha session', {
            instanceName,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Cria integração Chatwoot na Waha
 * Se o app já existe, retorna o app existente
 */
async function createWahaChatwootApp(sessionName, chatwootUrl, accountId, inboxId, accountToken, inboxIdentifier) {
    const wahaClient = await getWahaClient(accountId);
    try {
        logger_1.default.info('Creating Waha Chatwoot app', {
            sessionName,
            accountId,
            inboxId,
        });
        const response = await wahaClient.post('/api/apps', {
            id: '',
            session: sessionName,
            app: 'chatwoot',
            config: {
                url: chatwootUrl,
                accountId: accountId,
                inboxId: inboxId,
                accountToken: accountToken,
                inboxIdentifier: inboxIdentifier,
                locale: 'pt-BR',
            },
        });
        logger_1.default.info('Waha Chatwoot app created', {
            sessionName,
            status: response.status,
            data: response.data,
        });
        return response.data;
    }
    catch (error) {
        // Se o app já existe, busca o app existente
        const errorMessage = error.response?.data?.exception?.message || error.response?.data?.message || error.message;
        const isAppAlreadyExists = error.response?.status === 422 ||
            error.response?.status === 500 && (errorMessage?.includes('already exists') ||
                errorMessage?.includes('already has a Chatwoot app') ||
                errorMessage?.includes('Only one Chatwoot app'));
        if (isAppAlreadyExists) {
            logger_1.default.info('Waha Chatwoot app already exists, fetching existing apps', { sessionName, errorMessage });
            try {
                const existingApps = await wahaClient.get('/api/apps', {
                    params: { session: sessionName },
                });
                if (existingApps.data && existingApps.data.length > 0) {
                    const chatwootApp = existingApps.data.find((app) => app.app === 'chatwoot');
                    if (chatwootApp) {
                        logger_1.default.info('Existing Waha Chatwoot app found', { sessionName, appId: chatwootApp.id });
                        return chatwootApp;
                    }
                }
                // Se não encontrou app chatwoot, relança o erro original
                throw error;
            }
            catch (fetchError) {
                logger_1.default.error('Failed to fetch existing Waha apps', {
                    sessionName,
                    error: fetchError.message,
                });
                throw fetchError;
            }
        }
        logger_1.default.error('Failed to create Waha Chatwoot app', {
            sessionName,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Busca o ID do app Chatwoot criado
 */
async function getWahaAppId(accountId, sessionName) {
    const wahaClient = await getWahaClient(accountId);
    try {
        const response = await wahaClient.get('/api/apps', {
            params: { session: sessionName },
        });
        const apps = response.data;
        if (apps && apps.length > 0) {
            return apps[0].id;
        }
        throw new Error('No apps found for session');
    }
    catch (error) {
        logger_1.default.error('Failed to get Waha app ID', {
            sessionName,
            error: error.message,
        });
        throw error;
    }
}
/**
 * Lista todas as sessões Waha
 */
async function fetchWahaSessions(accountId) {
    const wahaClient = await getWahaClient(accountId);
    try {
        const response = await wahaClient.get('/api/sessions');
        return response.data || [];
    }
    catch (error) {
        logger_1.default.error('Failed to fetch Waha sessions', { error: error.message });
        throw error;
    }
}
/**
 * Obtém o status e QR code de uma sessão Waha
 */
async function getWahaSessionStatus(accountId, sessionName) {
    const wahaClient = await getWahaClient(accountId);
    try {
        // Busca informações da sessão
        const sessionResponse = await wahaClient.get(`/api/sessions/${sessionName}`);
        const sessionData = sessionResponse.data;
        logger_1.default.info('Waha session data received', {
            sessionName,
            status: sessionData.status,
            hasQR: !!sessionData.qr,
            keys: Object.keys(sessionData)
        });
        // Se a sessão está aguardando QR code, buscar a imagem
        if (sessionData.status === 'SCAN_QR_CODE' || sessionData.status === 'STARTING') {
            try {
                // Buscar QR code como imagem (igual ao outro projeto)
                const qrImageUrl = `/api/${sessionName}/auth/qr?format=image`;
                logger_1.default.info('Fetching QR image from Waha', { sessionName, url: qrImageUrl });
                const qrResponse = await wahaClient.get(qrImageUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'Accept': 'image/png'
                    }
                });
                // Converter para base64
                const base64Image = Buffer.from(qrResponse.data, 'binary').toString('base64');
                const qrBase64 = `data:image/png;base64,${base64Image}`;
                logger_1.default.info('QR code image converted to base64', {
                    sessionName,
                    base64Length: qrBase64.length
                });
                return {
                    ...sessionData,
                    qrcode: {
                        base64: qrBase64,
                        code: qrBase64
                    }
                };
            }
            catch (qrError) {
                logger_1.default.warn('Failed to fetch QR image from Waha', {
                    sessionName,
                    error: qrError.message,
                    status: qrError.response?.status
                });
            }
        }
        // Se a sessão já tem QR code no response principal
        if (sessionData.qr) {
            return {
                ...sessionData,
                qrcode: {
                    base64: sessionData.qr,
                    code: sessionData.qr
                }
            };
        }
        return sessionData;
    }
    catch (error) {
        logger_1.default.error('Failed to get Waha session status', {
            sessionName,
            error: error.message,
            response: error.response?.data
        });
        throw error;
    }
}
/**
 * Deleta uma sessão Waha
 */
async function deleteWahaSession(sessionName) {
    try {
        await wahaClient.delete(`/api/sessions/${sessionName}`);
        logger_1.default.info('Waha session deleted', { sessionName });
        return true;
    }
    catch (error) {
        logger_1.default.error('Failed to delete Waha session', {
            sessionName,
            error: error.message,
        });
        return false;
    }
}
/**
 * Desconecta (logout) uma sessão Waha
 */
async function logoutWahaSession(sessionName) {
    try {
        await wahaClient.post(`/api/sessions/${sessionName}/logout`);
        logger_1.default.info('Waha session logged out', { sessionName });
        return true;
    }
    catch (error) {
        logger_1.default.error('Failed to logout Waha session', {
            sessionName,
            error: error.message,
        });
        return false;
    }
}
/**
 * Reinicia uma sessão Waha (para gerar novo QR code)
 */
async function restartWahaSession(sessionName) {
    try {
        await wahaClient.post(`/api/sessions/${sessionName}/start`);
        logger_1.default.info('Waha session restarted', { sessionName });
        return true;
    }
    catch (error) {
        logger_1.default.error('Failed to restart Waha session', {
            sessionName,
            error: error.message,
        });
        return false;
    }
}
/**
 * Atualiza configurações do app Chatwoot na Waha
 */
async function updateWahaSessionConfig(sessionName, accountId, config) {
    try {
        const client = await getWahaClient(accountId);
        logger_1.default.info('Updating Waha session config', { sessionName, config });
        // Busca todos os apps uma vez
        const appsResponse = await client.get('/api/apps', {
            params: { session: sessionName },
        });
        // 1. Atualiza agentName no app Chatwoot (se fornecido)
        if (config.agentName !== undefined) {
            const chatwootApp = appsResponse.data?.find((app) => app.app === 'chatwoot');
            if (!chatwootApp) {
                throw new Error('App Chatwoot não encontrado para esta sessão');
            }
            logger_1.default.info('Chatwoot app found', { sessionName, appId: chatwootApp.id });
            const currentAppConfig = chatwootApp.config || {};
            const updatedAppConfig = { ...currentAppConfig };
            // Atualiza templates baseado em agentName
            if (config.agentName) {
                // Ativar nome do agente - adicionar templates
                updatedAppConfig.templates = {
                    'chatwoot.to.whatsapp.message.text': '*{{{chatwoot.sender.name}}}*:\n{{{ content }}}',
                    'chatwoot.to.whatsapp.message.media.caption': '{{#singleAttachment}}\n{{#content}}\n*{{{chatwoot.sender.name}}}*:\n{{{ content }}}\n{{/content}}\n{{/singleAttachment}}'
                };
            }
            else {
                // Desativar nome do agente - remover templates
                updatedAppConfig.templates = {};
            }
            // Atualiza o app Chatwoot
            await client.put(`/api/apps/${chatwootApp.id}`, {
                enabled: chatwootApp.enabled !== undefined ? chatwootApp.enabled : true,
                id: chatwootApp.id,
                session: sessionName,
                app: 'chatwoot',
                config: updatedAppConfig,
            });
            logger_1.default.info('Waha Chatwoot app config updated', { sessionName, appId: chatwootApp.id });
        }
        // 2. Atualiza app Calls (se fornecido rejectCalls ou callMessage)
        if (config.rejectCalls !== undefined || config.callMessage !== undefined) {
            const callsApp = appsResponse.data?.find((app) => app.app === 'calls');
            // Pega valores atuais ou defaults
            const currentConfig = await getWahaSessionConfig(sessionName, accountId);
            const rejectCalls = config.rejectCalls !== undefined ? config.rejectCalls : currentConfig.rejectCalls;
            const callMessage = config.callMessage !== undefined ? config.callMessage : currentConfig.callMessage;
            if (callsApp) {
                // App já existe, atualiza
                await updateWahaCallsApp(callsApp.id, sessionName, accountId, rejectCalls, callMessage);
            }
            else {
                // App não existe, cria
                await createWahaCallsApp(sessionName, accountId, rejectCalls, callMessage);
            }
            logger_1.default.info('Waha Calls app updated/created', { sessionName, rejectCalls, callMessage });
        }
        // 3. Atualiza config.ignore na sessão (se fornecido groups/channels/broadcast)
        if (config.ignoreGroups !== undefined ||
            config.ignoreChannels !== undefined ||
            config.ignoreBroadcast !== undefined) {
            // Busca sessão atual
            const sessionResponse = await client.get('/api/sessions', {
                params: { session: sessionName },
            });
            const session = Array.isArray(sessionResponse.data)
                ? sessionResponse.data.find((s) => s.name === sessionName)
                : sessionResponse.data;
            if (!session) {
                throw new Error('Sessão não encontrada');
            }
            const currentSessionConfig = session.config || {};
            const currentIgnore = currentSessionConfig.ignore || {};
            // Merge das configurações ignore
            const updatedIgnore = {
                ...currentIgnore,
                ...(config.ignoreGroups !== undefined && { groups: config.ignoreGroups }),
                ...(config.ignoreChannels !== undefined && { channels: config.ignoreChannels }),
                ...(config.ignoreBroadcast !== undefined && { broadcast: config.ignoreBroadcast }),
            };
            const updatedSessionConfig = {
                ...currentSessionConfig,
                ignore: updatedIgnore,
            };
            // Atualiza a sessão
            await client.put(`/api/sessions/${sessionName}`, {
                name: sessionName,
                config: updatedSessionConfig,
            });
            logger_1.default.info('Waha session config updated', { sessionName, updatedIgnore });
        }
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('Failed to update Waha session config', {
            sessionName,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Cria app "calls" para rejeitar ligações na Waha
 */
async function createWahaCallsApp(sessionName, accountId, rejectCalls, callMessage) {
    try {
        const client = await getWahaClient(accountId);
        logger_1.default.info('Creating Waha Calls app', { sessionName, rejectCalls, callMessage });
        const appId = `app_calls_${sessionName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const response = await client.post('/api/apps', {
            enabled: rejectCalls,
            id: appId,
            session: sessionName,
            app: 'calls',
            config: {
                dm: {
                    reject: rejectCalls,
                    message: callMessage,
                },
                group: {
                    reject: rejectCalls,
                    message: callMessage,
                },
            },
        });
        logger_1.default.info('Waha Calls app created', { sessionName, appId, data: response.data });
        return response.data;
    }
    catch (error) {
        // Se o app já existe, busca o app existente
        if (error.response?.status === 422 || error.response?.data?.message?.includes('already exists')) {
            logger_1.default.info('Waha Calls app might already exist, fetching existing apps', { sessionName });
            try {
                const client = await getWahaClient(accountId);
                const existingApps = await client.get('/api/apps', {
                    params: { session: sessionName },
                });
                if (existingApps.data && existingApps.data.length > 0) {
                    const callsApp = existingApps.data.find((app) => app.app === 'calls');
                    if (callsApp) {
                        logger_1.default.info('Existing Waha Calls app found', { sessionName, appId: callsApp.id });
                        return callsApp;
                    }
                }
                throw error;
            }
            catch (fetchError) {
                logger_1.default.error('Failed to fetch existing Waha apps', {
                    sessionName,
                    error: fetchError.message,
                });
                throw fetchError;
            }
        }
        logger_1.default.error('Failed to create Waha Calls app', {
            sessionName,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Atualiza app "calls" existente na Waha
 */
async function updateWahaCallsApp(appId, sessionName, accountId, rejectCalls, callMessage) {
    try {
        const client = await getWahaClient(accountId);
        logger_1.default.info('Updating Waha Calls app', { appId, sessionName, rejectCalls, callMessage });
        const response = await client.put(`/api/apps/${appId}`, {
            enabled: rejectCalls,
            id: appId,
            session: sessionName,
            app: 'calls',
            config: {
                dm: {
                    reject: rejectCalls,
                    message: callMessage,
                },
                group: {
                    reject: rejectCalls,
                    message: callMessage,
                },
            },
        });
        logger_1.default.info('Waha Calls app updated', { appId, sessionName, data: response.data });
        return response.data;
    }
    catch (error) {
        logger_1.default.error('Failed to update Waha Calls app', {
            appId,
            sessionName,
            error: error.message,
            response: error.response?.data,
        });
        throw error;
    }
}
/**
 * Busca configurações atuais do app Chatwoot na Waha
 */
async function getWahaSessionConfig(sessionName, accountId) {
    try {
        const client = await getWahaClient(accountId);
        // 1. Busca todos os apps da sessão
        const appsResponse = await client.get('/api/apps', {
            params: { session: sessionName },
        });
        // App Chatwoot para pegar agentName (templates)
        const chatwootApp = appsResponse.data?.find((app) => app.app === 'chatwoot');
        if (!chatwootApp) {
            throw new Error('App Chatwoot não encontrado para esta sessão');
        }
        const appConfig = chatwootApp.config || {};
        // Detecta se agentName está ativo baseado na presença dos templates
        const hasAgentNameTemplates = appConfig.templates &&
            Object.keys(appConfig.templates).length > 0 &&
            appConfig.templates['chatwoot.to.whatsapp.message.text']?.includes('chatwoot.sender.name');
        // 2. App Calls para pegar rejectCalls e callMessage
        const callsApp = appsResponse.data?.find((app) => app.app === 'calls');
        const callsConfig = callsApp?.config || {};
        const callsEnabled = callsApp?.enabled || false;
        const dmConfig = callsConfig.dm || {};
        const callMessage = dmConfig.message || '';
        // 3. Busca a sessão para pegar config.ignore (groups, channels, broadcast)
        const sessionResponse = await client.get('/api/sessions', {
            params: { session: sessionName },
        });
        const session = Array.isArray(sessionResponse.data)
            ? sessionResponse.data.find((s) => s.name === sessionName)
            : sessionResponse.data;
        const sessionConfig = session?.config || {};
        const ignoreConfig = sessionConfig.ignore || {};
        return {
            agentName: hasAgentNameTemplates,
            ignoreGroups: ignoreConfig.groups || false,
            ignoreChannels: ignoreConfig.channels || false,
            ignoreBroadcast: ignoreConfig.broadcast || false,
            rejectCalls: callsEnabled && dmConfig.reject,
            callMessage: callMessage,
            callsAppId: callsApp?.id || null,
        };
    }
    catch (error) {
        logger_1.default.error('Failed to get Waha session config', {
            sessionName,
            error: error.message,
        });
        throw error;
    }
}
//# sourceMappingURL=waha.js.map