"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const chatwootDatabase_1 = __importDefault(require("./chatwootDatabase"));
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const stream_1 = require("stream");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const dns_1 = __importDefault(require("dns"));
// Função de lookup DNS customizada que usa servidores DNS públicos com timeout de segurança
const customLookup = (hostname, options, callback) => {
    const resolver = new dns_1.default.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    // Timeout de 5s para evitar travamento em redes restritas
    let settled = false;
    const fallbackTimer = setTimeout(() => {
        if (settled)
            return;
        settled = true;
        logger_1.default.warn('Custom DNS resolver timed out, falling back to default', { hostname });
        dns_1.default.lookup(hostname, options, callback);
    }, 5000);
    resolver.resolve4(hostname, (err, addresses) => {
        if (settled)
            return;
        if (!err && addresses && addresses.length > 0) {
            settled = true;
            clearTimeout(fallbackTimer);
            callback(null, addresses[0], 4);
            return;
        }
        // Se falhar com IPv4, tentar IPv6
        resolver.resolve6(hostname, (err6, addresses6) => {
            if (settled)
                return;
            if (!err6 && addresses6 && addresses6.length > 0) {
                settled = true;
                clearTimeout(fallbackTimer);
                callback(null, addresses6[0], 6);
                return;
            }
            // Se ambos falharem, usar dns.lookup padrão como fallback
            settled = true;
            clearTimeout(fallbackTimer);
            logger_1.default.warn('Custom DNS resolver failed, falling back to default', {
                hostname,
                err4: err?.message,
                err6: err6?.message
            });
            dns_1.default.lookup(hostname, options, callback);
        });
    });
};
class ChatwootAPI {
    client;
    baseURL;
    constructor() {
        // Deriva a URL do Chatwoot das variáveis de ambiente
        let chatwootUrl = process.env.CHATWOOT_API_URL;
        // Se CHATWOOT_API_URL não estiver definida, deriva de CHATWOOT_DOMAIN
        if (!chatwootUrl && process.env.CHATWOOT_DOMAIN) {
            const domain = process.env.CHATWOOT_DOMAIN;
            chatwootUrl = domain.startsWith('http') ? domain : `https://${domain}`;
            logger_1.default.info('Derived CHATWOOT_API_URL from CHATWOOT_DOMAIN', {
                domain: process.env.CHATWOOT_DOMAIN,
                derivedUrl: chatwootUrl
            });
        }
        if (!chatwootUrl) {
            throw new Error('CHATWOOT_API_URL ou CHATWOOT_DOMAIN não definida! Configure no docker-compose.swarm.yml');
        }
        this.baseURL = chatwootUrl;
        logger_1.default.info('Chatwoot API initialized', { baseURL: this.baseURL });
        // Configurar HTTP agents sem lookup customizado
        // Usar configuração padrão do Node.js
        const httpAgent = new http_1.default.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
        });
        const httpsAgent = new https_1.default.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            // Aceitar certificados auto-assinados em desenvolvimento
            rejectUnauthorized: process.env.NODE_ENV === 'production',
        });
        this.client = axios_1.default.create({
            baseURL: this.baseURL,
            timeout: 30000, // Aumentar timeout para 30s
            httpAgent,
            httpsAgent,
        });
    }
    setJWTHeaders(jwt) {
        this.client.defaults.headers.common['access-token'] = jwt['access-token'];
        this.client.defaults.headers.common['token-type'] = jwt['token-type'];
        this.client.defaults.headers.common['client'] = jwt.client;
        this.client.defaults.headers.common['expiry'] = jwt.expiry;
        this.client.defaults.headers.common['uid'] = jwt.uid;
    }
    async validateJWT(jwt) {
        try {
            logger_1.default.info('Validating JWT', {
                uid: jwt.uid,
                hasAccessToken: !!jwt['access-token'],
                hasClient: !!jwt.client,
                accessTokenPrefix: jwt['access-token']?.substring(0, 10),
                method: 'attempting_database_first'
            });
            // PRIORIDADE 1: Validação direta no banco (muito mais rápido)
            const userFromDB = await chatwootDatabase_1.default.validateJWTDirect(jwt['access-token'], jwt.client, jwt.uid);
            if (userFromDB) {
                logger_1.default.info('JWT validated via database (fast path)', {
                    userId: userFromDB.id,
                    uid: userFromDB.uid
                });
                return userFromDB;
            }
            // FALLBACK: Se falhar no banco, tenta via API (método antigo)
            logger_1.default.info('Database validation failed, trying API fallback', { uid: jwt.uid });
            this.setJWTHeaders(jwt);
            const response = await this.client.get('/api/v1/profile');
            logger_1.default.info('JWT validated via API (slow fallback)', {
                userId: response.data.id
            });
            // Normaliza o formato de accounts: Chatwoot API retorna [{id, name, role}]
            // mas resolveAccountId espera [{account_id, role}]
            const rawData = response.data;
            if (Array.isArray(rawData.accounts)) {
                rawData.accounts = rawData.accounts.map((a) => ({
                    account_id: a.account_id ?? a.id,
                    role: a.role,
                }));
            }
            return rawData;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const axiosError = error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : null;
            logger_1.default.error('JWT validation failed (both methods)', {
                error: errorMessage,
                axiosError,
                uid: jwt.uid,
                chatwootUrl: this.baseURL
            });
            return null;
        }
    }
    async validateAPIToken(apiToken) {
        try {
            logger_1.default.info('Validating API token', {
                tokenPrefix: apiToken.substring(0, 10),
                method: 'attempting_database_first'
            });
            // PRIORIDADE 1: Validação direta no banco (muito mais rápido)
            const userFromDB = await chatwootDatabase_1.default.validateAPITokenDirect(apiToken);
            if (userFromDB) {
                logger_1.default.info('API token validated via database (fast path)', {
                    userId: userFromDB.id
                });
                return userFromDB;
            }
            // FALLBACK: Se falhar no banco, tenta via API (método antigo)
            logger_1.default.info('Database validation failed, trying API fallback');
            const response = await this.client.get('/api/v1/profile', {
                headers: {
                    'api_access_token': apiToken
                }
            });
            logger_1.default.info('API token validated via API (slow fallback)', {
                userId: response.data.id
            });
            // Normaliza accounts: Chatwoot API retorna [{id, name, role}]
            // mas resolveAccountId espera [{account_id, role}]
            const rawData = response.data;
            if (Array.isArray(rawData.accounts)) {
                rawData.accounts = rawData.accounts.map((a) => ({
                    account_id: a.account_id ?? a.id,
                    role: a.role,
                }));
            }
            return rawData;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('API token validation failed (both methods)', {
                error: errorMessage
            });
            return null;
        }
    }
    async getUserAccessToken(jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get('/api/v1/profile', {
                headers: apiToken ? headers : undefined,
            });
            // Log completo da resposta para verificar estrutura
            logger_1.default.info('Profile response received', {
                userId: response.data.id,
                hasAccessToken: !!response.data.access_token,
                responseKeys: Object.keys(response.data)
            });
            const userAccessToken = response.data.access_token;
            if (!userAccessToken) {
                logger_1.default.warn('No access_token in profile response', { responseData: response.data });
            }
            return userAccessToken || null;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get user access token', { error: errorMessage });
            return null;
        }
    }
    async getConversations(accountId, jwt, apiToken, params) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            // Se fetchAll=true, busca todas as páginas
            if (params?.fetchAll) {
                const allConversations = [];
                let currentPage = 1;
                let hasMorePages = true;
                while (hasMorePages) {
                    const queryParams = {
                        status: params?.status || 'all',
                        page: currentPage,
                    };
                    if (params?.assignee_type) {
                        queryParams.assignee_type = params.assignee_type;
                    }
                    if (params?.inbox_id) {
                        queryParams.inbox_id = params.inbox_id;
                    }
                    const response = await this.client.get(`/api/v1/accounts/${accountId}/conversations`, {
                        headers: apiToken ? headers : undefined,
                        params: queryParams,
                    });
                    const conversations = response.data.data?.payload || [];
                    const meta = response.data.data?.meta;
                    allConversations.push(...conversations);
                    // Verifica se há mais páginas
                    if (meta && meta.current_page < meta.count) {
                        currentPage++;
                    }
                    else {
                        hasMorePages = false;
                    }
                    // Proteção: limite de 20 páginas (300 conversas)
                    if (currentPage > 20) {
                        logger_1.default.warn('Reached pagination limit (20 pages)', { accountId });
                        hasMorePages = false;
                    }
                }
                logger_1.default.info('All conversations fetched', { accountId, count: allConversations.length, pages: currentPage });
                return allConversations;
            }
            // Comportamento original: busca apenas uma página
            const queryParams = {
                status: params?.status || 'all',
                page: params?.page || 1,
            };
            if (params?.assignee_type) {
                queryParams.assignee_type = params.assignee_type;
            }
            if (params?.inbox_id) {
                queryParams.inbox_id = params.inbox_id;
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/conversations`, {
                headers: apiToken ? headers : undefined,
                params: queryParams,
            });
            const conversations = response.data.data?.payload || [];
            logger_1.default.info('Conversations fetched', { accountId, count: conversations.length });
            return conversations;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch conversations', { accountId, error: errorMessage });
            throw error;
        }
    }
    async updateConversationStatus(accountId, conversationId, status, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`, { status }, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Conversation status updated', { conversationId, status });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to update status', { conversationId, error: errorMessage });
            return false;
        }
    }
    async getAccountAgents(accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/agents`, {
                headers: apiToken ? headers : undefined,
            });
            const agents = response.data || [];
            logger_1.default.info('Account agents fetched', { accountId, count: agents.length });
            return agents;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch account agents', { accountId, error: errorMessage });
            return [];
        }
    }
    // Busca labels da conta
    async getAccountLabels(accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/labels`, {
                headers: apiToken ? headers : undefined,
            });
            const labels = response.data?.payload || response.data || [];
            logger_1.default.info('Account labels fetched', { accountId, count: labels.length });
            return labels;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch account labels', { accountId, error: errorMessage });
            return [];
        }
    }
    // Busca times da conta
    async getAccountTeams(accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/teams`, {
                headers: apiToken ? headers : undefined,
            });
            const teams = response.data || [];
            logger_1.default.info('Account teams fetched', { accountId, count: teams.length });
            return teams;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch account teams', { accountId, error: errorMessage });
            return [];
        }
    }
    // Busca detalhes de uma conversa específica
    async getConversation(accountId, conversationId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/conversations/${conversationId}`, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Conversation details fetched', { conversationId });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch conversation details', { conversationId, error: errorMessage });
            return null;
        }
    }
    // Marca mensagens de uma conversa como lidas (update_last_seen)
    async markConversationAsRead(accountId, conversationId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/update_last_seen`, {}, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Conversation marked as read', { accountId, conversationId });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to mark conversation as read', { accountId, conversationId, error: errorMessage });
        }
    }
    // Busca mensagens de uma conversa
    async getConversationMessages(accountId, conversationId, jwt, apiToken, params) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                headers: apiToken ? headers : undefined,
                params: params
            });
            const messages = response.data.payload || response.data || [];
            logger_1.default.info('Messages fetched', { conversationId, count: messages.length });
            return messages;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch messages', { conversationId, error: errorMessage });
            return [];
        }
    }
    // Helper para baixar arquivo de URL temporariamente
    async downloadFile(url) {
        try {
            const tempDir = path_1.default.join(process.cwd(), 'temp');
            // Cria diretório temp se não existir
            if (!fs_1.default.existsSync(tempDir)) {
                fs_1.default.mkdirSync(tempDir, { recursive: true });
            }
            // Gera nome de arquivo único
            const fileName = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}${path_1.default.extname(url.split('?')[0])}`;
            const filePath = path_1.default.join(tempDir, fileName);
            // Baixa o arquivo
            const response = await axios_1.default.get(url, { responseType: 'stream' });
            const streamPipeline = (0, util_1.promisify)(stream_1.pipeline);
            await streamPipeline(response.data, fs_1.default.createWriteStream(filePath));
            logger_1.default.info('File downloaded temporarily', { url, filePath });
            return filePath;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to download file', { url, error: errorMsg });
            return null;
        }
    }
    // Envia mensagem para uma conversa
    async sendWhatsAppTemplate(accountId, conversationId, templateName, language, processedParams, apiToken, jwt) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                headers['access-token'] = jwt['access-token'];
                headers['token-type'] = jwt['token-type'] || 'Bearer';
                headers['client'] = jwt.client;
                headers['expiry'] = jwt.expiry;
                headers['uid'] = jwt.uid;
            }
            // Chatwoot espera processed_params como objeto indexado {"1": "val1", "2": "val2"}
            // não como array — array vazio [] causa "undefined method 'reject' for nil"
            const processedParamsObj = {};
            processedParams.forEach((val, idx) => {
                processedParamsObj[String(idx + 1)] = val;
            });
            // template_params deve ficar no nível RAIZ (não dentro de content_attributes)
            // O MessageBuilder do Chatwoot lê @params[:template_params] diretamente
            await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                content: templateName,
                message_type: 'outgoing',
                content_type: 'text',
                template_params: {
                    name: templateName,
                    language: language,
                    processed_params: processedParamsObj,
                }
            }, { headers: Object.keys(headers).length > 0 ? headers : undefined });
            logger_1.default.info('WhatsApp template sent', { accountId, conversationId, templateName });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const responseData = error?.response?.data;
            const responseStatus = error?.response?.status;
            logger_1.default.error('Failed to send WhatsApp template', {
                accountId, conversationId, templateName,
                error: errorMessage,
                responseStatus,
                responseData: JSON.stringify(responseData),
            });
            throw error;
        }
    }
    async sendMessage(accountId, conversationId, message, jwt, apiToken, attachmentPath) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
                logger_1.default.info('Sending message with API token', {
                    conversationId,
                    tokenPrefix: apiToken.substring(0, 8),
                    tokenLength: apiToken.length,
                    hasAttachment: !!attachmentPath
                });
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
                logger_1.default.info('Sending message with JWT', {
                    conversationId,
                    hasAttachment: !!attachmentPath
                });
            }
            else {
                logger_1.default.warn('Sending message without authentication', { conversationId });
            }
            // Se houver anexo, usa FormData
            if (attachmentPath) {
                let localFilePath = attachmentPath;
                let tempFile = false;
                // Se for URL, baixa temporariamente
                if (attachmentPath.startsWith('http://') || attachmentPath.startsWith('https://')) {
                    logger_1.default.info('Attachment is URL, downloading...', { url: attachmentPath });
                    const downloaded = await this.downloadFile(attachmentPath);
                    if (downloaded) {
                        localFilePath = downloaded;
                        tempFile = true;
                    }
                    else {
                        logger_1.default.warn('Failed to download attachment, sending message without attachment', { url: attachmentPath });
                        // Continua sem anexo
                        localFilePath = '';
                    }
                }
                // Verifica se o arquivo existe (seja original ou baixado)
                if (localFilePath && fs_1.default.existsSync(localFilePath)) {
                    try {
                        const formData = new form_data_1.default();
                        formData.append('content', message || '');
                        formData.append('message_type', 'outgoing');
                        formData.append('private', 'false');
                        // Detecta MIME type pela extensão para garantir classificação correta no Chatwoot.
                        // Sem isso, form-data usa video/webm para .webm, fazendo Chatwoot tratar áudio como vídeo.
                        const fileExt = path_1.default.extname(localFilePath).toLowerCase();
                        const audioMimeMap = {
                            '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
                            '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
                            '.wav': 'audio/wav', '.aac': 'audio/aac',
                            '.webm': 'audio/webm', // força audio/webm em vez de video/webm
                        };
                        const explicitMime = audioMimeMap[fileExt];
                        const appendOptions = explicitMime
                            ? { filename: path_1.default.basename(localFilePath), contentType: explicitMime }
                            : { filename: path_1.default.basename(localFilePath) };
                        formData.append('attachments[]', fs_1.default.createReadStream(localFilePath), appendOptions);
                        await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, formData, {
                            headers: {
                                ...headers,
                                ...formData.getHeaders()
                            }
                        });
                        logger_1.default.info('Message with attachment sent successfully', { conversationId });
                        // Remove arquivo temporário se foi baixado
                        if (tempFile && localFilePath) {
                            try {
                                fs_1.default.unlinkSync(localFilePath);
                                logger_1.default.info('Temporary file deleted', { filePath: localFilePath });
                            }
                            catch (unlinkError) {
                                logger_1.default.warn('Failed to delete temporary file', { filePath: localFilePath });
                            }
                        }
                        return true;
                    }
                    catch (sendError) {
                        // Remove arquivo temporário em caso de erro
                        if (tempFile && localFilePath) {
                            try {
                                fs_1.default.unlinkSync(localFilePath);
                            }
                            catch { }
                        }
                        throw sendError;
                    }
                }
            }
            // Sem anexo ou falha no download, envia JSON normal
            {
                // Sem anexo, envia JSON normal
                await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                    content: message,
                    message_type: 'outgoing',
                    private: false
                }, { headers: apiToken ? headers : undefined });
                logger_1.default.info('Message sent successfully', { conversationId });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to send message', { conversationId, error: errorMessage });
            return false;
        }
    }
    // Envia nota privada (visível apenas para agentes) em uma conversa
    async sendPrivateNote(accountId, conversationId, content, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                content,
                message_type: 'outgoing',
                private: true,
            }, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Private note sent', { accountId, conversationId });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to send private note', { conversationId, error: errorMessage });
            return false;
        }
    }
    // Deleta uma conversa
    async deleteConversation(accountId, conversationId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.delete(`/api/v1/accounts/${accountId}/conversations/${conversationId}`, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Conversation deleted', {
                accountId,
                conversationId,
                status: response.status,
                data: JSON.stringify(response.data).substring(0, 200),
            });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const status = error.response?.status;
            const data = JSON.stringify(error.response?.data).substring(0, 200);
            logger_1.default.error('Failed to delete conversation', { accountId, conversationId, error: errorMessage, status, data });
            throw error; // repassa o erro para o handler retornar 500
        }
    }
    // Busca dados de um contato específico
    async getContact(accountId, contactId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/contacts/${contactId}`, { headers: apiToken ? headers : undefined });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch contact', { accountId, contactId, error: errorMessage });
            return null;
        }
    }
    // Busca todas as conversas de um contato
    async getContactConversations(accountId, contactId, apiToken, jwt) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`, { headers: apiToken ? headers : undefined });
            return response.data.payload || response.data || [];
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch contact conversations', { accountId, contactId, error: errorMessage });
            return [];
        }
    }
    // Lista todas as inboxes (canais) de uma conta
    async getInboxes(accountId, jwt, apiToken) {
        try {
            // Sempre prefere JWT quando disponível (melhor permissão)
            if (jwt) {
                this.setJWTHeaders(jwt);
                logger_1.default.info('Using JWT for inboxes request', { accountId });
            }
            else if (apiToken) {
                // Fallback para API token se não tiver JWT
                logger_1.default.info('Using API token for inboxes request', { accountId });
            }
            const headers = {};
            if (apiToken && !jwt) {
                headers['api_access_token'] = apiToken;
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/inboxes`, {
                headers: (apiToken && !jwt) ? headers : undefined,
            });
            const inboxes = response.data.payload || response.data || [];
            logger_1.default.info('Inboxes fetched successfully from Chatwoot', {
                accountId,
                count: inboxes.length,
                usedJWT: !!jwt,
                usedApiToken: !jwt && !!apiToken
            });
            return inboxes;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to fetch inboxes', {
                accountId,
                error: errorMessage,
                hadJWT: !!jwt,
                hadApiToken: !!apiToken
            });
            return [];
        }
    }
    async getWhatsAppTemplates(accountId, inboxId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            // Templates ficam no campo message_templates do próprio objeto de inbox
            // O endpoint /whatsapp_templates não existe no Chatwoot — usar GET /inboxes/:id
            const response = await this.client.get(`/api/v1/accounts/${accountId}/inboxes/${inboxId}`, { headers: apiToken ? headers : undefined });
            const templates = response.data?.message_templates || [];
            logger_1.default.info('WhatsApp templates fetched', { accountId, inboxId, count: templates.length });
            return templates;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.warn('Failed to fetch WhatsApp templates', { accountId, inboxId, error: errorMessage });
            return [];
        }
    }
    // Cria uma nova inbox
    async createInbox(accountId, data, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.post(`/api/v1/accounts/${accountId}/inboxes`, data, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Inbox created', { accountId, inboxId: response.data.id, name: data.name });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to create inbox', { accountId, error: errorMessage });
            throw error;
        }
    }
    async deleteInbox(accountId, inboxId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.delete(`/api/v1/accounts/${accountId}/inboxes/${inboxId}`, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Inbox deleted', { accountId, inboxId });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to delete inbox', { accountId, inboxId, error: errorMessage });
            return false;
        }
    }
    // Lista contatos com paginação (sem query de busca)
    async getContacts(accountId, page = 1, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/contacts`, {
                headers: apiToken ? headers : undefined,
                params: { page, sort: 'last_activity_at', include_contacts: true },
            });
            const payload = response.data.payload || response.data || [];
            const meta = response.data.meta || {};
            logger_1.default.info('Contacts listed', { accountId, page, count: Array.isArray(payload) ? payload.length : 0 });
            return { payload: Array.isArray(payload) ? payload : [], meta };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to list contacts', { accountId, page, error: errorMessage });
            return { payload: [], meta: {} };
        }
    }
    // Busca contatos por identificador (phone_number ou email)
    async searchContacts(accountId, query, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.get(`/api/v1/accounts/${accountId}/contacts/search`, {
                headers: apiToken ? headers : undefined,
                params: { q: query }
            });
            const contacts = response.data.payload || response.data || [];
            logger_1.default.info('Contacts searched', { accountId, query, count: contacts.length });
            return contacts;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to search contacts', { accountId, query, error: errorMessage });
            return [];
        }
    }
    // Cria um novo contato
    async createContact(accountId, data, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.post(`/api/v1/accounts/${accountId}/contacts`, data, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Contact created', { accountId, contactId: response.data.id });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to create contact', { accountId, error: errorMessage });
            return null;
        }
    }
    // Cria uma nova conversa
    async createConversation(accountId, data, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.post(`/api/v1/accounts/${accountId}/conversations`, data, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Conversation created', { accountId, conversationId: response.data.id });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to create conversation', { accountId, error: errorMessage });
            return null;
        }
    }
    // Busca perfil do usuário (suporta JWT e API Token)
    async getUserProfile(jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                headers['access-token'] = jwt['access-token'];
                headers['token-type'] = jwt['token-type'];
                headers['client'] = jwt.client;
                headers['expiry'] = jwt.expiry;
                headers['uid'] = jwt.uid;
            }
            else {
                throw new Error('JWT ou API Token é necessário');
            }
            logger_1.default.info('Calling Chatwoot getUserProfile', {
                baseURL: this.baseURL,
                fullURL: `${this.baseURL}/api/v1/profile`,
                hasApiToken: !!apiToken,
                hasJWT: !!jwt
            });
            const response = await this.client.get('/api/v1/profile', { headers });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to get user profile', {
                error: errorMessage,
                baseURL: this.baseURL,
                fullURL: `${this.baseURL}/api/v1/profile`
            });
            throw error;
        }
    }
    // Envia anexo/imagem para uma conversa (para chatbot flows)
    async sendAttachment(conversationId, imageUrl, caption, accountId, jwt, apiToken) {
        try {
            // Para chatbot flows, usa o primeiro agente admin da conta
            if (!jwt && !apiToken && accountId) {
                const agents = await this.getAccountAgents(accountId);
                const admin = agents.find(a => a.role === 'administrator');
                if (admin) {
                    // Usa access_token do admin
                    const token = await this.getAgentAccessToken(accountId, admin.id);
                    apiToken = token || undefined;
                }
            }
            if (!accountId) {
                throw new Error('accountId is required for sending attachments');
            }
            // Verifica se é URL local (começa com /uploads/)
            if (imageUrl.startsWith('/uploads/')) {
                // Upload real do arquivo
                const filePath = `${process.cwd()}${imageUrl}`;
                // Verifica se arquivo existe
                if (!fs_1.default.existsSync(filePath)) {
                    logger_1.default.error('File not found', { filePath });
                    throw new Error(`File not found: ${filePath}`);
                }
                const formData = new form_data_1.default();
                // Só adiciona content se houver caption (evita duplicação no Chatwoot)
                if (caption && caption.trim()) {
                    formData.append('content', caption);
                }
                formData.append('attachments[]', fs_1.default.createReadStream(filePath));
                const headers = {
                    ...formData.getHeaders(),
                };
                if (apiToken) {
                    headers['api_access_token'] = apiToken;
                }
                const response = await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, formData, { headers });
                logger_1.default.info('Attachment uploaded successfully', {
                    conversationId,
                    filePath,
                    messageId: response.data?.id
                });
                return true;
            }
            else {
                // URL externa - envia como mensagem com link
                const message = caption ? `${caption}\n\n${imageUrl}` : imageUrl;
                await this.sendMessage(accountId, conversationId, message, jwt, apiToken);
                logger_1.default.info('External URL sent as message', { conversationId, imageUrl });
                return true;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to send attachment', { conversationId, error: errorMessage });
            return false;
        }
    }
    // Adiciona labels a uma conversa
    async addLabels(conversationId, labels, accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, { labels }, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Labels added to conversation', { conversationId, labels });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to add labels', { conversationId, error: errorMessage });
            return false;
        }
    }
    // Remove labels de uma conversa
    async removeLabels(conversationId, labels, accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            // Chatwoot API usa DELETE com body para remover labels
            await this.client.delete(`/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, {
                data: { labels },
                headers: apiToken ? headers : undefined
            });
            logger_1.default.info('Labels removed from conversation', { conversationId, labels });
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to remove labels', { conversationId, error: errorMessage });
            return false;
        }
    }
    // Atribui um agente ou time a uma conversa
    async assign(conversationId, assignType, assignId, accountId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            if (assignType === 'agent') {
                // Atribui agente
                await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`, { assignee_id: assignId }, { headers: apiToken ? headers : undefined });
                logger_1.default.info('Agent assigned to conversation', { conversationId, agentId: assignId });
            }
            else {
                // Atribui time
                await this.client.post(`/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`, { team_id: assignId }, { headers: apiToken ? headers : undefined });
                logger_1.default.info('Team assigned to conversation', { conversationId, teamId: assignId });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to assign', { conversationId, assignType, assignId, error: errorMessage });
            return false;
        }
    }
    // Backwards compatibility: manter assignAgent como alias
    async assignAgent(conversationId, agentId, accountId, jwt, apiToken) {
        return this.assign(conversationId, 'agent', agentId, accountId, jwt, apiToken);
    }
    // Busca access token de um agente (helper para chatbot flows)
    async getAgentAccessToken(accountId, agentId) {
        try {
            // Este método pode não existir na API do Chatwoot
            // Por enquanto, retorna null e será necessário configurar um token fixo
            logger_1.default.warn('getAgentAccessToken not implemented, returning null');
            return null;
        }
        catch (error) {
            logger_1.default.error('Failed to get agent access token');
            return null;
        }
    }
    // Atualiza a webhook_url de uma inbox (para integração Waha)
    async updateInboxWebhookUrl(accountId, inboxId, webhookUrl, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.patch(`/api/v1/accounts/${accountId}/inboxes/${inboxId}`, {
                channel: {
                    webhook_url: webhookUrl,
                },
            }, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Inbox webhook URL updated', { accountId, inboxId, webhookUrl });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to update inbox webhook URL', {
                accountId,
                inboxId,
                error: errorMessage,
            });
            throw error;
        }
    }
    /**
     * Cria um webhook global no Chatwoot
     */
    async createWebhook(accountId, url, subscriptions, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const response = await this.client.post(`/api/v1/accounts/${accountId}/webhooks`, { url, subscriptions }, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Webhook created', { accountId, webhookId: response.data.id, url });
            return response.data;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to create webhook', { accountId, error: errorMessage });
            throw error;
        }
    }
    /**
     * Remove um webhook global do Chatwoot
     */
    async deleteWebhook(accountId, webhookId, jwt, apiToken) {
        try {
            const headers = {};
            if (apiToken) {
                headers['api_access_token'] = apiToken;
            }
            else if (jwt) {
                this.setJWTHeaders(jwt);
            }
            await this.client.delete(`/api/v1/accounts/${accountId}/webhooks/${webhookId}`, { headers: apiToken ? headers : undefined });
            logger_1.default.info('Webhook deleted', { accountId, webhookId });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.error('Failed to delete webhook', { accountId, webhookId, error: errorMessage });
            throw error;
        }
    }
    // Busca o conversationId mais recente associado a um número de telefone
    async findLatestConversationByPhone(accountId, phone, jwt, apiToken) {
        try {
            if (jwt) {
                this.setJWTHeaders(jwt);
            }
            const headers = {};
            if (apiToken && !jwt) {
                headers['api_access_token'] = apiToken;
            }
            // 1. Buscar contato pelo telefone
            const searchResp = await this.client.get(`/api/v1/accounts/${accountId}/contacts/search`, {
                headers: apiToken && !jwt ? headers : undefined,
                params: { q: phone, include_contacts: true },
            });
            const contacts = searchResp.data.payload || searchResp.data || [];
            if (!contacts.length)
                return null;
            const contactId = contacts[0].id;
            // 2. Buscar conversas do contato
            const convResp = await this.client.get(`/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`, { headers: apiToken && !jwt ? headers : undefined });
            const convPayload = convResp.data.payload || convResp.data || {};
            const conversations = convPayload.conversations || convPayload || [];
            if (!Array.isArray(conversations) || !conversations.length)
                return null;
            // Preferir conversa aberta mais recente, senão a mais recente em geral
            const sorted = [...conversations].sort((a, b) => b.id - a.id);
            const openConv = sorted.find((c) => c.status === 'open');
            const chosen = openConv || sorted[0];
            return chosen?.id || null;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.default.warn('findLatestConversationByPhone failed', { accountId, phone, error: errorMessage });
            return null;
        }
    }
}
exports.default = new ChatwootAPI();
//# sourceMappingURL=chatwoot.js.map