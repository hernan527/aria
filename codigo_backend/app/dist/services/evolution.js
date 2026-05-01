"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectEvolutionAndGetQR = exports.getEvolutionInstanceSettings = exports.getEvolutionChatwootSettings = exports.updateEvolutionInstanceSettings = exports.updateEvolutionChatwootSettings = exports.getEvolutionInstanceInfo = exports.fetchEvolutionInstances = exports.logoutEvolutionInstance = exports.deleteEvolutionInstance = exports.getInstanceStatus = exports.createEvolutionInstance = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const systemSettings_1 = require("./systemSettings");
class EvolutionAPI {
    /**
     * Cria um cliente Axios configurado com as credenciais da conta
     */
    async getClient(accountId) {
        const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
        const baseURL = settings.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
        const apiKey = settings.evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
        const client = axios_1.default.create({
            baseURL,
            timeout: 30000,
            headers: {
                'apikey': apiKey,
                'Content-Type': 'application/json',
            },
        });
        // Interceptor: loga TODA requisição feita à Evolution API
        client.interceptors.request.use((config) => {
            logger_1.default.warn(`[EVO-REQUEST] ${config.method?.toUpperCase()} ${config.url}`, {
                accountId,
                method: config.method?.toUpperCase(),
                url: config.url,
                baseURL,
            });
            return config;
        });
        logger_1.default.info('Evolution API client created', { accountId, baseURL });
        return { client, baseURL, apiKey };
    }
    /**
     * Cria uma nova instância WhatsApp na Evolution API com integração Chatwoot
     */
    async createInstance(accountId, instanceName, phoneNumber, inboxId, chatwootConfig) {
        try {
            const { client, baseURL, apiKey } = await this.getClient(accountId);
            logger_1.default.info('Creating Evolution instance', { accountId, instanceName, phoneNumber, inboxId, hasChatwootConfig: !!chatwootConfig });
            // Payload base
            const payload = {
                instanceName: instanceName,
                token: '',
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
                rejectCall: true,
                msgCall: 'Infelizmente não aceitamos ligações',
                groupsIgnore: false,
                alwaysOnline: false,
                readMessages: true,
                readStatus: true,
                syncFullHistory: false,
            };
            // Se tem configuração do Chatwoot, adiciona ao payload
            if (chatwootConfig) {
                logger_1.default.info('Adding Chatwoot integration to instance', {
                    accountId: chatwootConfig.accountId,
                    url: chatwootConfig.url,
                    nameInbox: chatwootConfig.nameInbox
                });
                payload.chatwootAccountId = chatwootConfig.accountId.toString();
                payload.chatwootToken = chatwootConfig.token;
                payload.chatwootUrl = chatwootConfig.url;
                payload.chatwootSignMsg = false;
                payload.chatwootReopenConversation = false;
                payload.chatwootConversationPending = false;
                payload.chatwootImportContacts = false;
                payload.chatwootNameInbox = chatwootConfig.nameInbox;
                payload.chatwootMergeBrazilContacts = true;
                payload.chatwootImportMessages = false;
                payload.chatwootDaysLimitImportMessages = 0;
            }
            // Passo 1: Cria a instância
            // O payload contém qrcode: true, então a Evolution API já retorna o QR na resposta.
            const createResponse = await client.post('/instance/create', payload);
            logger_1.default.info('Instance created', {
                instanceName,
                hasQrcodeInResponse: !!(createResponse.data.qrcode?.base64),
                instanceStatus: createResponse.data.instance?.status,
            });
            // Passo 2: Verifica se a Evolution já retornou o QR na resposta do /instance/create.
            // Quando qrcode: true é enviado, a Evolution gera o QR automaticamente.
            // NÃO chamamos /instance/connect se o QR já veio na criação — isso evita
            // reiniciar o ciclo interno da Evolution (looping de verificação).
            let qrcode = undefined;
            if (createResponse.data.qrcode?.base64) {
                // QR já disponível na resposta da criação — usa direto, sem chamar /instance/connect
                qrcode = {
                    base64: createResponse.data.qrcode.base64,
                    code: createResponse.data.qrcode.code || '',
                };
                logger_1.default.info('QR code obtained from /instance/create response (no extra connect call needed)', { instanceName });
            }
            else {
                // Evolution não retornou QR na criação — aguarda 2s para a instância inicializar
                // completamente antes de chamar /instance/connect.
                // IMPORTANTE: sem este delay, chamar /instance/connect imediatamente após /instance/create
                // causa o "looping de verificação" nos logs da Evolution (canal reinicia em loop).
                // Quando feito via curl manualmente, o usuário espera naturalmente alguns segundos.
                logger_1.default.info('QR not in create response, waiting 2s for instance to initialize...', { instanceName });
                await new Promise(resolve => setTimeout(resolve, 2000));
                logger_1.default.info('Calling /instance/connect once after delay', { instanceName });
                try {
                    const connectResponse = await client.get(`/instance/connect/${instanceName}`);
                    logger_1.default.info('Initial QR generated via /instance/connect', { instanceName, hasBase64: !!connectResponse.data?.base64 });
                    if (connectResponse.data?.base64) {
                        qrcode = {
                            base64: connectResponse.data.base64,
                            code: connectResponse.data.code || '',
                        };
                    }
                }
                catch (connectError) {
                    logger_1.default.warn('Failed to get initial QR via /instance/connect (non-critical)', { instanceName, error: connectError });
                }
            }
            return {
                instance: {
                    instanceName: createResponse.data.instance?.instanceName || instanceName,
                    status: createResponse.data.instance?.status || 'connecting',
                },
                qrcode,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to create Evolution instance', { instanceName, error: errorMessage });
            throw new Error(`Erro ao criar instância WhatsApp: ${errorMessage}`);
        }
    }
    /**
     * Verifica o status de uma instância (somente leitura — não gera QR)
     */
    async getStatus(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            const response = await client.get(`/instance/connectionState/${instanceName}`);
            logger_1.default.info('Instance status fetched', { instanceName, state: response.data.instance?.state });
            return {
                instance: {
                    instanceName,
                    status: response.data.instance?.state || response.data.state || response.data.status || 'unknown',
                },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get instance status', { instanceName, error: errorMessage });
            throw new Error(`Erro ao verificar status: ${errorMessage}`);
        }
    }
    /**
     * Conecta a instância e retorna o QR code.
     * Chamar APENAS em: criação, reconexão após desconexão, ou botão "Gerar novo QR".
     */
    async connectAndGetQR(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            // Verifica estado atual primeiro
            let currentState = 'connecting';
            try {
                const stateResponse = await client.get(`/instance/connectionState/${instanceName}`);
                currentState = stateResponse.data.instance?.state || 'connecting';
            }
            catch {
                // ignora erro na verificação de estado
            }
            // Se já conectado, retorna sem gerar QR
            if (currentState === 'open') {
                logger_1.default.info('Instance already connected, skipping QR generation', { instanceName });
                return { instance: { instanceName, status: 'open' } };
            }
            // Chama /instance/connect para gerar o QR
            logger_1.default.info('Calling /instance/connect to generate QR', { instanceName });
            const connectResponse = await client.get(`/instance/connect/${instanceName}`);
            logger_1.default.info('QR generated via connect', { instanceName, hasBase64: !!connectResponse.data?.base64 });
            let qrcode;
            if (connectResponse.data?.base64) {
                qrcode = {
                    base64: connectResponse.data.base64,
                    code: connectResponse.data.code || '',
                };
            }
            return {
                instance: { instanceName, status: currentState },
                qrcode,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to connect instance and get QR', { instanceName, error: errorMessage });
            throw new Error(`Erro ao conectar instância: ${errorMessage}`);
        }
    }
    /**
     * Deleta uma instância
     */
    async deleteInstance(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            await client.delete(`/instance/delete/${instanceName}`);
            logger_1.default.info('Instance deleted', { instanceName });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to delete instance', { instanceName, error: errorMessage });
            return false;
        }
    }
    /**
     * Desconecta (logout) de uma instância
     */
    async logoutInstance(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            await client.delete(`/instance/logout/${instanceName}`);
            logger_1.default.info('Instance logged out', { instanceName });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to logout instance', { instanceName, error: errorMessage });
            return false;
        }
    }
    /**
     * Lista todas as instâncias
     */
    async fetchInstances(accountId) {
        try {
            const { client } = await this.getClient(accountId);
            const response = await client.get('/instance/fetchInstances');
            logger_1.default.info('Instances fetched', { count: response.data?.length || 0 });
            return response.data || [];
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch instances', { error: errorMessage });
            throw new Error(`Erro ao listar instâncias: ${errorMessage}`);
        }
    }
    /**
     * Busca informações detalhadas da instância (número conectado, perfil, etc)
     */
    async getInstanceInfo(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            // Busca informações da instância
            const response = await client.get(`/instance/fetchInstances?instanceName=${instanceName}`);
            logger_1.default.info('Instance info fetched', { instanceName, data: response.data });
            if (!response.data || response.data.length === 0) {
                throw new Error('Instância não encontrada');
            }
            return response.data[0] || response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get instance info', { instanceName, error: errorMessage });
            throw new Error(`Erro ao buscar informações: ${errorMessage}`);
        }
    }
    /**
     * Atualiza configurações do Chatwoot (agent name)
     */
    async updateChatwootSettings(accountId, instanceName, config) {
        try {
            const { client } = await this.getClient(accountId);
            logger_1.default.info('Updating Chatwoot settings', { instanceName, config });
            const response = await client.post(`/chatwoot/set/${instanceName}`, config);
            logger_1.default.info('Chatwoot settings updated', { instanceName, data: response.data });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const apiError = error.response?.data || error.response || {};
            logger_1.default.error('Failed to update Chatwoot settings', {
                instanceName,
                error: errorMessage,
                status: error.response?.status,
                statusText: error.response?.statusText,
                apiError: apiError,
                requestPayload: config
            });
            throw new Error(`Erro ao atualizar configurações do Chatwoot: ${errorMessage} - ${JSON.stringify(apiError)}`);
        }
    }
    /**
     * Atualiza configurações da instância (grupos, chamadas, etc)
     */
    async updateInstanceSettings(accountId, instanceName, config) {
        try {
            const { client } = await this.getClient(accountId);
            logger_1.default.info('Updating instance settings', { instanceName, config });
            const response = await client.post(`/settings/set/${instanceName}`, config);
            logger_1.default.info('Instance settings updated', { instanceName, data: response.data });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const apiError = error.response?.data || error.response || {};
            logger_1.default.error('Failed to update instance settings', {
                instanceName,
                error: errorMessage,
                status: error.response?.status,
                statusText: error.response?.statusText,
                apiError: apiError,
                requestPayload: config
            });
            throw new Error(`Erro ao atualizar configurações da instância: ${errorMessage} - ${JSON.stringify(apiError)}`);
        }
    }
    /**
     * Busca configurações atuais do Chatwoot
     */
    async getChatwootSettings(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            const response = await client.get(`/chatwoot/find/${instanceName}`);
            logger_1.default.info('Chatwoot settings fetched', { instanceName, data: response.data });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get Chatwoot settings', { instanceName, error: errorMessage });
            throw new Error(`Erro ao buscar configurações do Chatwoot: ${errorMessage}`);
        }
    }
    /**
     * Busca configurações atuais da instância
     */
    async getInstanceSettings(accountId, instanceName) {
        try {
            const { client } = await this.getClient(accountId);
            const response = await client.get(`/settings/find/${instanceName}`);
            logger_1.default.info('Instance settings fetched', { instanceName, data: response.data });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get instance settings', { instanceName, error: errorMessage });
            throw new Error(`Erro ao buscar configurações da instância: ${errorMessage}`);
        }
    }
}
const evolutionAPI = new EvolutionAPI();
const createEvolutionInstance = (accountId, instanceName, phoneNumber, inboxId, chatwootConfig) => evolutionAPI.createInstance(accountId, instanceName, phoneNumber, inboxId, chatwootConfig);
exports.createEvolutionInstance = createEvolutionInstance;
const getInstanceStatus = (accountId, instanceName) => evolutionAPI.getStatus(accountId, instanceName);
exports.getInstanceStatus = getInstanceStatus;
const deleteEvolutionInstance = (accountId, instanceName) => evolutionAPI.deleteInstance(accountId, instanceName);
exports.deleteEvolutionInstance = deleteEvolutionInstance;
const logoutEvolutionInstance = (accountId, instanceName) => evolutionAPI.logoutInstance(accountId, instanceName);
exports.logoutEvolutionInstance = logoutEvolutionInstance;
const fetchEvolutionInstances = (accountId) => evolutionAPI.fetchInstances(accountId);
exports.fetchEvolutionInstances = fetchEvolutionInstances;
const getEvolutionInstanceInfo = (accountId, instanceName) => evolutionAPI.getInstanceInfo(accountId, instanceName);
exports.getEvolutionInstanceInfo = getEvolutionInstanceInfo;
const updateEvolutionChatwootSettings = (accountId, instanceName, config) => evolutionAPI.updateChatwootSettings(accountId, instanceName, config);
exports.updateEvolutionChatwootSettings = updateEvolutionChatwootSettings;
const updateEvolutionInstanceSettings = (accountId, instanceName, config) => evolutionAPI.updateInstanceSettings(accountId, instanceName, config);
exports.updateEvolutionInstanceSettings = updateEvolutionInstanceSettings;
const getEvolutionChatwootSettings = (accountId, instanceName) => evolutionAPI.getChatwootSettings(accountId, instanceName);
exports.getEvolutionChatwootSettings = getEvolutionChatwootSettings;
const getEvolutionInstanceSettings = (accountId, instanceName) => evolutionAPI.getInstanceSettings(accountId, instanceName);
exports.getEvolutionInstanceSettings = getEvolutionInstanceSettings;
const connectEvolutionAndGetQR = (accountId, instanceName) => evolutionAPI.connectAndGetQR(accountId, instanceName);
exports.connectEvolutionAndGetQR = connectEvolutionAndGetQR;
exports.default = evolutionAPI;
//# sourceMappingURL=evolution.js.map