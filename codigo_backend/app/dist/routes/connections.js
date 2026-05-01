"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const evolution_1 = require("../services/evolution");
const waha_1 = require("../services/waha");
const uazapi_1 = require("../services/uazapi");
const database_1 = __importStar(require("../services/database"));
const chatwootDatabase_1 = __importDefault(require("../services/chatwootDatabase"));
const systemSettings_1 = require("../services/systemSettings");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
/**
 * Resolve as credenciais Uazapi para uma conta, buscando em ordem:
 * 1. Tabela uazapiConfig (salva por POST /connections/uazapi-config)
 * 2. SystemSettings (salvo no AdminSetup / Config Extra)
 * 3. Variáveis de ambiente UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN
 */
async function resolveUazapiConfig(accountId) {
    // 1. Tabela dedicada
    const savedConfig = await database_1.default.uazapiConfig.findUnique({ where: { accountId } });
    if (savedConfig) {
        return { baseUrl: savedConfig.baseUrl, adminToken: savedConfig.adminToken };
    }
    // 2. SystemSettings (configurado via Config Extra / AdminSetup)
    try {
        const sysSettings = await (0, systemSettings_1.getSystemSettings)(accountId);
        if (sysSettings.uazapiBaseUrl && sysSettings.uazapiAdminToken) {
            return { baseUrl: sysSettings.uazapiBaseUrl, adminToken: sysSettings.uazapiAdminToken };
        }
    }
    catch { /* ignora erro de settings */ }
    // 3. Variáveis de ambiente globais
    if (process.env.UAZAPI_BASE_URL && process.env.UAZAPI_ADMIN_TOKEN) {
        return { baseUrl: process.env.UAZAPI_BASE_URL, adminToken: process.env.UAZAPI_ADMIN_TOKEN };
    }
    return null;
}
/**
 * Verifica se a conta atingiu o limite de caixas de entrada configurado
 * no Super Admin do Chatwoot (campo accounts.limits.inboxes).
 * Lança um erro se o limite foi atingido.
 */
async function checkInboxLimit(accountId) {
    if (!database_1.chatwootPool)
        return; // sem banco Chatwoot configurado, pula verificação
    try {
        // 1. Busca o limite definido para a conta no Chatwoot
        const limitResult = await database_1.chatwootPool.query("SELECT limits->>'inboxes' AS inbox_limit FROM accounts WHERE id = $1", [accountId]);
        const row = limitResult.rows[0];
        if (!row || !row.inbox_limit)
            return; // sem limite → livre para criar
        const maxInboxes = parseInt(row.inbox_limit, 10);
        if (isNaN(maxInboxes) || maxInboxes <= 0)
            return;
        // 2. Conta as inboxes atuais da conta
        const countResult = await database_1.chatwootPool.query('SELECT COUNT(*) AS count FROM inboxes WHERE account_id = $1', [accountId]);
        const currentCount = parseInt(countResult.rows[0]?.count || '0', 10);
        logger_1.default.info('Inbox limit check', { accountId, currentCount, maxInboxes });
        if (currentCount >= maxInboxes) {
            throw new Error(`Limite de caixas de entrada atingido. O plano atual permite ${maxInboxes} caixa${maxInboxes !== 1 ? 's' : ''} e você já possui ${currentCount}.`);
        }
    }
    catch (err) {
        // Re-propaga apenas erros de limite; ignora falhas de consulta
        if (err.message?.includes('Limite de caixas'))
            throw err;
        logger_1.default.warn('checkInboxLimit query failed, skipping check', { accountId, error: err.message });
    }
}
// Lista todas as instâncias (Evolution API + Waha)
// IMPORTANTE: Filtra apenas instâncias que pertencem à conta atual (multi-tenancy)
router.get('/instances', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        // 1. Busca as inboxes da conta atual no Chatwoot
        // Prefere API access token (mais confiável que JWT para chamadas de API Chatwoot),
        // buscando do banco do Chatwoot quando o usuário autenticou via JWT.
        let inboxApiToken = authReq.apiToken;
        if (!inboxApiToken && authReq.user?.id) {
            try {
                inboxApiToken = (await chatwootDatabase_1.default.getUserAccessToken(authReq.user.id)) ?? undefined;
                if (inboxApiToken) {
                    logger_1.default.info('Using API token from Chatwoot DB for inboxes request', { accountId, userId: authReq.user.id });
                }
            }
            catch (tokenErr) {
                logger_1.default.warn('Failed to get user API token from Chatwoot DB, falling back to JWT', { userId: authReq.user.id, error: tokenErr });
            }
        }
        const inboxes = await chatwoot_1.default.getInboxes(accountId, inboxApiToken ? undefined : (authReq.jwt['access-token'] ? authReq.jwt : undefined), inboxApiToken);
        // 2. Extrai os nomes das inboxes (usados como instanceName)
        const accountInboxNames = inboxes.map((inbox) => inbox.name.toLowerCase().trim());
        if (accountInboxNames.length === 0) {
            logger_1.default.warn('No inboxes found for account — all instances will be filtered out', {
                accountId,
                userId: authReq.user?.id,
                hadApiToken: !!inboxApiToken,
                hadJWT: !inboxApiToken && !!authReq.jwt?.['access-token'],
            });
        }
        logger_1.default.info('Filtering instances for account', {
            accountId,
            inboxCount: accountInboxNames.length,
            inboxNames: accountInboxNames
        });
        // 3. Busca instâncias da Evolution API
        let evolutionInstances = [];
        try {
            evolutionInstances = await (0, evolution_1.fetchEvolutionInstances)(accountId);
        }
        catch (error) {
            logger_1.default.warn('Failed to fetch Evolution instances', { error });
        }
        // 4. Busca sessões da Waha
        let wahaInstances = [];
        try {
            const allWahaSessions = await (0, waha_1.fetchWahaSessions)(accountId);
            // Filtra sessões que pertencem a esta conta
            // Padrão: Whatsapp_{instanceName}_CWID_{accountId}
            wahaInstances = allWahaSessions
                .filter((session) => {
                const sessionName = session.name || '';
                const pattern = new RegExp(`^Whatsapp_(.+)_CWID_${accountId}$`);
                const match = sessionName.match(pattern);
                if (match) {
                    const instanceName = match[1].toLowerCase().trim();
                    return accountInboxNames.includes(instanceName);
                }
                return false;
            })
                .map((session) => {
                // Extrai o instanceName do padrão
                const pattern = new RegExp(`^Whatsapp_(.+)_CWID_${accountId}$`);
                const match = session.name.match(pattern);
                const instanceName = match ? match[1] : session.name;
                return {
                    name: instanceName,
                    state: session.status || 'unknown',
                    provider: 'waha',
                };
            });
        }
        catch (error) {
            logger_1.default.warn('Failed to fetch Waha sessions', { error });
        }
        // 5. Busca instâncias Uazapi do banco de dados
        let uazapiInstances = [];
        try {
            const savedUazapiInstances = await database_1.default.uazapiInstance.findMany({
                where: { accountId },
            });
            // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
            let uazapiConfig = null;
            try {
                uazapiConfig = await resolveUazapiConfig(accountId);
            }
            catch (configError) {
                logger_1.default.warn('Failed to load Uazapi config', { error: configError });
            }
            // Filtra apenas instâncias que têm inbox correspondente e busca status real
            const filteredInstances = savedUazapiInstances.filter((inst) => {
                const instanceName = inst.instanceName.toLowerCase().trim();
                return accountInboxNames.includes(instanceName);
            });
            // Busca status de cada instância em paralelo
            uazapiInstances = await Promise.all(filteredInstances.map(async (inst) => {
                let state = 'unknown';
                if (uazapiConfig) {
                    try {
                        const status = await (0, uazapi_1.getUazapiInstanceStatus)(uazapiConfig, inst.instanceToken);
                        state = status.instance?.status || 'unknown';
                    }
                    catch (error) {
                        logger_1.default.debug('Failed to get Uazapi instance status', {
                            instanceName: inst.instanceName,
                            error
                        });
                    }
                }
                return {
                    name: inst.instanceName,
                    state,
                    provider: 'uazapi',
                };
            }));
            logger_1.default.info('Uazapi instances found', {
                accountId,
                count: uazapiInstances.length,
            });
        }
        catch (error) {
            logger_1.default.warn('Failed to fetch Uazapi instances', { error });
        }
        // Filtra instâncias Evolution por inbox names
        const filteredEvolution = evolutionInstances.filter((inst) => {
            const instanceName = (inst.name || inst.instanceName || '').toLowerCase().trim();
            return accountInboxNames.includes(instanceName);
        });
        logger_1.default.info('Instances filtered', {
            accountId,
            evolutionInstances: filteredEvolution.length,
            wahaInstances: wahaInstances.length,
            uazapiInstances: uazapiInstances.length,
            total: filteredEvolution.length + wahaInstances.length + uazapiInstances.length
        });
        // 6. Combina e formata instâncias de todos os provedores
        const formattedEvolution = filteredEvolution.map((inst) => ({
            instance: {
                instanceName: inst.name || inst.instanceName,
                state: inst.connectionStatus || inst.state || 'unknown',
                provider: 'evolution',
            }
        }));
        const formattedWaha = wahaInstances.map((inst) => ({
            instance: {
                instanceName: inst.name,
                state: inst.state,
                provider: 'waha',
            }
        }));
        const formattedUazapi = uazapiInstances.map((inst) => ({
            instance: {
                instanceName: inst.name,
                state: inst.state,
                provider: 'uazapi',
            }
        }));
        const allFormattedInstances = [...formattedEvolution, ...formattedWaha, ...formattedUazapi];
        res.json({ data: allFormattedInstances });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to fetch instances', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao listar instâncias' });
    }
});
// Cria nova instância (com suporte a Evolution e Waha)
router.post('/create-instance', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName, provider = 'evolution' } = req.body;
        if (!instanceName) {
            return res.status(400).json({ error: 'Nome da instância é obrigatório' });
        }
        if (!['evolution', 'waha', 'uazapi'].includes(provider)) {
            return res.status(400).json({ error: 'Provedor inválido' });
        }
        // Verifica provedores permitidos
        const permissions = await database_1.default.accountPermissions.findUnique({
            where: { accountId },
        });
        let allowedProviders = ['evolution', 'waha', 'uazapi'];
        if (permissions?.allowedProviders) {
            try {
                allowedProviders = JSON.parse(permissions.allowedProviders);
            }
            catch (e) {
                logger_1.default.error('Failed to parse allowedProviders', { accountId, error: e });
            }
        }
        if (!allowedProviders.includes(provider)) {
            return res.status(403).json({ error: 'Provedor não permitido para esta conta' });
        }
        // Verifica limite de caixas de entrada configurado no Super Admin do Chatwoot
        await checkInboxLimit(accountId);
        // Busca o access_token do perfil do usuário
        const userAccessToken = await chatwoot_1.default.getUserAccessToken(authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
        if (!userAccessToken) {
            return res.status(500).json({ error: 'Erro ao obter token de acesso do usuário' });
        }
        if (provider === 'evolution') {
            // Evolution API cria automaticamente o inbox no Chatwoot
            const chatwootUrl = process.env.CHATWOOT_API_URL ||
                (process.env.CHATWOOT_DOMAIN ? `https://${process.env.CHATWOOT_DOMAIN}` : '');
            const chatwootConfig = {
                accountId: accountId,
                token: userAccessToken,
                url: chatwootUrl,
                nameInbox: instanceName,
            };
            const evolutionResponse = await (0, evolution_1.createEvolutionInstance)(accountId, instanceName, '', 0, chatwootConfig);
            return res.json({
                success: true,
                provider: 'evolution',
                instance: evolutionResponse.instance,
                qrcode: evolutionResponse.qrcode || null,
            });
        }
        else if (provider === 'waha') {
            // Cria instância na Waha
            // 1. Cria a sessão Waha
            const wahaSession = await (0, waha_1.createWahaSession)(accountId, instanceName);
            const sessionName = wahaSession.name;
            // 2. Busca ou cria a inbox no Chatwoot
            // Primeiro verifica se já existe
            let inbox;
            const inboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
            inbox = inboxes.find((i) => i.name === instanceName);
            if (!inbox) {
                // Cria inbox API channel no Chatwoot
                inbox = await chatwoot_1.default.createInbox(accountId, {
                    name: instanceName,
                    channel: {
                        type: 'api',
                    },
                }, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                // Busca novamente para pegar o identifier gerado
                const updatedInboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                inbox = updatedInboxes.find((i) => i.id === inbox.id) || inbox;
            }
            // Extrai o identifier correto do banco de dados do Chatwoot
            // Busca direto da tabela channel_api usando o channel_id da inbox
            if (!database_1.chatwootPool) {
                throw new Error('CHATWOOT_DATABASE_URL não configurado');
            }
            const channelIdQuery = await database_1.chatwootPool.query('SELECT id, identifier FROM channel_api WHERE id = $1', [inbox.channel_id]);
            if (!channelIdQuery.rows || channelIdQuery.rows.length === 0) {
                throw new Error(`Channel API não encontrado para inbox ${inbox.id}`);
            }
            const channelApi = channelIdQuery.rows[0];
            const inboxIdentifier = channelApi.identifier || String(channelApi.id);
            logger_1.default.info('Using inbox identifier for Waha from database', {
                inboxId: inbox.id,
                channelId: channelApi.id,
                inboxIdentifier,
                hasIdentifier: !!channelApi.identifier
            });
            // 3. Cria integração Chatwoot na Waha
            await (0, waha_1.createWahaChatwootApp)(sessionName, process.env.CHATWOOT_API_URL || '', accountId, inbox.id, userAccessToken, inboxIdentifier);
            // 4. Busca o ID do app criado
            const appId = await (0, waha_1.getWahaAppId)(accountId, sessionName);
            // 5. Atualiza a webhook_url direto no banco de dados
            // Busca a URL da Waha das configurações da conta
            const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
            const wahaApiUrl = settings.wahaApiUrl || process.env.WAHA_API_URL || '';
            if (!wahaApiUrl) {
                throw new Error('URL da Waha não configurada! Configure em Config Extra -> Setup');
            }
            const webhookUrl = `${wahaApiUrl}/webhooks/chatwoot/${sessionName}/${appId}`;
            await database_1.chatwootPool.query('UPDATE channel_api SET webhook_url = $1, updated_at = NOW() WHERE id = $2', [webhookUrl, channelApi.id]);
            logger_1.default.info('Webhook URL updated in database', {
                channelId: channelApi.id,
                webhookUrl,
                wahaApiUrl
            });
            logger_1.default.info('Waha instance created successfully', {
                sessionName,
                instanceName,
                inboxId: inbox.id,
                webhookUrl,
            });
            return res.json({
                success: true,
                provider: 'waha',
                instance: {
                    instanceName: sessionName,
                    state: wahaSession.status || 'CREATED',
                },
            });
        }
        else if (provider === 'uazapi') {
            // Cria instância na Uazapi
            // 1. Busca configurações do Uazapi (tabela → SystemSettings → env vars)
            const uazapiConfig = await resolveUazapiConfig(accountId);
            if (!uazapiConfig) {
                return res.status(400).json({
                    error: 'Configurações do Uazapi não encontradas. Configure em Config Extra (Conexões → UaZapi) ou defina UAZAPI_BASE_URL e UAZAPI_ADMIN_TOKEN.',
                });
            }
            // 2. Cria a instância na Uazapi (POST /instance/init)
            const uazapiInstance = await (0, uazapi_1.createUazapiInstance)(uazapiConfig, instanceName, accountId, `kanbancw-${accountId}`);
            // 3. Guarda o token da instância no banco
            await database_1.default.uazapiInstance.upsert({
                where: {
                    accountId_instanceName: {
                        accountId,
                        instanceName,
                    },
                },
                create: {
                    accountId,
                    instanceName,
                    instanceToken: uazapiInstance.token,
                },
                update: {
                    instanceToken: uazapiInstance.token,
                },
            });
            logger_1.default.info('Uazapi instance token saved', {
                instanceName,
                accountId,
            });
            // 4. Conecta a instância para gerar QR code
            // Se falhar (ex: limite atingido), remove a instância do banco para não deixar "fantasma"
            let qrCodeResult;
            try {
                qrCodeResult = await (0, uazapi_1.connectUazapiInstance)(uazapiConfig, uazapiInstance.token);
            }
            catch (connectError) {
                // Limpa do banco a instância recém criada (evita instâncias órfãs)
                try {
                    await database_1.default.uazapiInstance.delete({
                        where: { accountId_instanceName: { accountId, instanceName } },
                    });
                    logger_1.default.info('Uazapi orphan instance removed from DB after connect failure', { instanceName });
                }
                catch { /* ignora se não existia */ }
                // Tenta também deletar da Uazapi API (best-effort)
                try {
                    await (0, uazapi_1.deleteUazapiInstance)(uazapiConfig, uazapiInstance.token);
                }
                catch { /* ignora se falhar */ }
                throw connectError; // re-propaga com a mensagem original (ex: limite atingido)
            }
            logger_1.default.info('Uazapi QR code generated', {
                instanceName,
                hasQrcode: !!qrCodeResult.qrcode,
            });
            // 5. Busca ou cria a inbox no Chatwoot
            let inbox;
            const inboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
            inbox = inboxes.find((i) => i.name === instanceName);
            if (!inbox) {
                // Cria inbox API channel no Chatwoot
                inbox = await chatwoot_1.default.createInbox(accountId, {
                    name: instanceName,
                    channel: {
                        type: 'api',
                    },
                }, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                // Busca novamente para pegar o identifier gerado
                const updatedInboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                inbox = updatedInboxes.find((i) => i.id === inbox.id) || inbox;
            }
            logger_1.default.info('Chatwoot inbox ready for Uazapi', {
                instanceName,
                inboxId: inbox.id,
            });
            // 6. Configura integração Chatwoot na Uazapi
            const chatwootIntegrationConfig = {
                enabled: true,
                url: process.env.CHATWOOT_API_URL || '',
                access_token: userAccessToken,
                account_id: accountId,
                inbox_id: inbox.id,
                ignore_groups: false,
                sign_messages: false,
                create_new_conversation: false,
            };
            await (0, uazapi_1.configureUazapiChatwoot)(uazapiConfig, uazapiInstance.token, chatwootIntegrationConfig);
            logger_1.default.info('Uazapi Chatwoot integration configured', {
                instanceName,
                inboxId: inbox.id,
            });
            return res.json({
                success: true,
                provider: 'uazapi',
                instance: {
                    instanceName: instanceName,
                    state: 'CREATED',
                },
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to create instance', { error: errorMessage });
        // Retorna a mensagem real do erro (pode conter info de limite Uazapi, etc.)
        res.status(500).json({ error: errorMessage || 'Erro ao criar instância' });
    }
});
// Obtém QR code de uma instância específica
router.get('/qrcode/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        // Tenta buscar na Uazapi primeiro
        try {
            const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
                where: {
                    accountId_instanceName: {
                        accountId,
                        instanceName,
                    },
                },
            });
            if (uazapiInstance) {
                logger_1.default.info('Found Uazapi instance, fetching status', { instanceName, accountId });
                // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
                const uazapiConfig = await resolveUazapiConfig(accountId);
                if (!uazapiConfig) {
                    throw new Error('Configurações do Uazapi não encontradas. Configure em Config Extra.');
                }
                // Primeiro verifica o status
                const uazapiStatus = await (0, uazapi_1.getUazapiInstanceStatus)(uazapiConfig, uazapiInstance.instanceToken);
                logger_1.default.info('[Uazapi QR] Full status response from API', {
                    instanceName,
                    fullResponse: JSON.stringify(uazapiStatus, null, 2),
                    instanceStatus: uazapiStatus.instance?.status,
                    instanceState: uazapiStatus.instance?.state,
                    hasQrcode: !!uazapiStatus.instance?.qrcode,
                });
                // Se não está conectado e não tem QR code, gera um novo
                let qrcode = uazapiStatus.instance?.qrcode || null;
                let status = uazapiStatus.instance?.status || 'unknown';
                if (!qrcode && (status === 'disconnected' || status === 'close' || status === 'connecting')) {
                    logger_1.default.info('Generating new QR code for Uazapi instance', { instanceName });
                    await (0, uazapi_1.connectUazapiInstance)(uazapiConfig, uazapiInstance.instanceToken);
                    status = 'connecting';
                    // A Uazapi gera o QR code de forma assíncrona após o connect.
                    // Faz polling por até 8 segundos até o QR code aparecer.
                    const maxAttempts = 8;
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        try {
                            const pollStatus = await (0, uazapi_1.getUazapiInstanceStatus)(uazapiConfig, uazapiInstance.instanceToken);
                            const pollQrcode = pollStatus.instance?.qrcode || null;
                            logger_1.default.info('[Uazapi QR] Polling attempt', {
                                instanceName,
                                attempt,
                                hasQrcode: !!pollQrcode,
                                instanceStatus: pollStatus.instance?.status,
                            });
                            if (pollQrcode) {
                                qrcode = pollQrcode;
                                status = pollStatus.instance?.status || status;
                                break;
                            }
                            // Se conectou sem QR (já estava autenticado), encerra o polling
                            if (pollStatus.instance?.status === 'open' || pollStatus.instance?.status === 'connected') {
                                status = pollStatus.instance.status;
                                break;
                            }
                        }
                        catch (pollError) {
                            logger_1.default.warn('[Uazapi QR] Polling error', { attempt, error: pollError });
                        }
                    }
                }
                logger_1.default.info('[Uazapi QR] Final response being sent to frontend', {
                    instanceName,
                    status,
                    hasQrcode: !!qrcode,
                    qrcodeLength: qrcode ? qrcode.length : 0,
                });
                res.json({
                    instanceName: instanceName,
                    status: status,
                    qrcode: qrcode,
                    provider: 'uazapi',
                });
                return;
            }
        }
        catch (uazapiError) {
            logger_1.default.debug('Instance not found in Uazapi, trying other providers', { instanceName, error: uazapiError });
        }
        // Tenta buscar na Waha (verifica se existe sessão com padrão)
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        try {
            const wahaStatus = await (0, waha_1.getWahaSessionStatus)(accountId, wahaSessionName);
            logger_1.default.info('Waha QR code response', {
                instanceName,
                sessionName: wahaSessionName,
                status: wahaStatus.status,
                hasQrcode: !!wahaStatus.qrcode,
                qrcodeKeys: wahaStatus.qrcode ? Object.keys(wahaStatus.qrcode) : [],
                responseKeys: Object.keys(wahaStatus)
            });
            const response = {
                instanceName: instanceName,
                status: wahaStatus.status || 'unknown',
                qrcode: wahaStatus.qrcode || null,
                provider: 'waha',
            };
            res.json(response);
            return;
        }
        catch (wahaError) {
            // Se não encontrou na Waha, tenta na Evolution
            logger_1.default.debug('Instance not found in Waha, trying Evolution', { instanceName, error: wahaError });
        }
        // Tenta buscar na Evolution API
        // ?poll=true → somente leitura de estado (não gera QR)
        // sem ?poll=true → chama /instance/connect para gerar/retornar QR
        const isPoll = req.query.poll === 'true';
        if (isPoll) {
            const evolutionStatus = await (0, evolution_1.getInstanceStatus)(accountId, instanceName);
            res.json({
                instanceName: evolutionStatus.instance.instanceName,
                status: evolutionStatus.instance.status,
                qrcode: null,
                provider: 'evolution',
            });
        }
        else {
            const evolutionStatus = await (0, evolution_1.connectEvolutionAndGetQR)(accountId, instanceName);
            res.json({
                instanceName: evolutionStatus.instance.instanceName,
                status: evolutionStatus.instance.status,
                qrcode: evolutionStatus.qrcode,
                provider: 'evolution',
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get QR code', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao obter QR code' });
    }
});
// Lista todos os canais (inboxes) do Chatwoot
router.get('/channels', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        logger_1.default.info('Fetching channels', {
            accountId,
            userId: authReq.user.id,
            hasJWT: !!authReq.jwt,
            hasApiToken: !!authReq.apiToken
        });
        const inboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt, authReq.apiToken);
        // Mapeia os dados para garantir o formato correto
        const formattedInboxes = inboxes.map((inbox) => ({
            id: inbox.id,
            name: inbox.name,
            channel_type: inbox.channel_type || inbox.channel?.type || 'unknown'
        }));
        logger_1.default.info('Channels fetched successfully', {
            accountId,
            count: formattedInboxes.length,
            inboxes: formattedInboxes
        });
        res.json(formattedInboxes);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to fetch channels', {
            accountId: req.user?.account_id,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        });
        res.status(500).json({ error: 'Erro ao buscar canais' });
    }
});
// Deleta uma instância da Evolution API
router.delete('/delete-instance/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        const deleteInbox = req.query.deleteInbox === 'true';
        logger_1.default.info('Deleting instance', { instanceName, deleteInbox });
        // Tenta deletar em todos os provedores
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        let deletedFromWaha = false;
        let deletedFromEvolution = false;
        let deletedFromUazapi = false;
        let deletedInbox = false;
        // Se solicitado, deleta a inbox no Chatwoot primeiro
        if (deleteInbox) {
            try {
                // Busca as inboxes para encontrar o ID da inbox com este nome
                const inboxes = await chatwoot_1.default.getInboxes(accountId, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                const inbox = inboxes.find((i) => i.name.toLowerCase().trim() === instanceName.toLowerCase().trim());
                if (inbox) {
                    await chatwoot_1.default.deleteInbox(accountId, inbox.id, authReq.jwt['access-token'] ? authReq.jwt : undefined, authReq.jwt['access-token'] ? undefined : authReq.apiToken);
                    deletedInbox = true;
                    logger_1.default.info('Inbox deleted', { inboxId: inbox.id, instanceName });
                }
                else {
                    logger_1.default.warn('Inbox not found for instance', { instanceName });
                }
            }
            catch (inboxError) {
                logger_1.default.error('Failed to delete inbox', { instanceName, error: inboxError });
                // Continua mesmo se falhar ao deletar inbox
            }
        }
        // Tenta deletar da Uazapi
        try {
            const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
                where: {
                    accountId_instanceName: {
                        accountId,
                        instanceName,
                    },
                },
            });
            if (uazapiInstance) {
                // Tenta deletar na API Uazapi (best-effort: se falhar, ainda limpa o banco)
                try {
                    const uazapiConfig = await resolveUazapiConfig(accountId);
                    if (uazapiConfig) {
                        await (0, uazapi_1.deleteUazapiInstance)(uazapiConfig, uazapiInstance.instanceToken);
                        logger_1.default.info('Uazapi instance deleted from API', { instanceName });
                    }
                }
                catch (apiError) {
                    // Token inválido, API indisponível, etc. — apenas loga e continua
                    logger_1.default.warn('Failed to delete Uazapi instance from API (will still remove from DB)', {
                        instanceName,
                        error: apiError?.message || apiError,
                    });
                }
                // Remove do banco de dados SEMPRE, independente da API Uazapi responder
                await database_1.default.uazapiInstance.delete({
                    where: {
                        accountId_instanceName: {
                            accountId,
                            instanceName,
                        },
                    },
                });
                deletedFromUazapi = true;
                logger_1.default.info('Uazapi instance record deleted from database', { instanceName });
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to delete Uazapi instance record', { error });
        }
        // Tenta deletar da Waha
        try {
            await (0, waha_1.logoutWahaSession)(wahaSessionName);
            logger_1.default.info('Waha session logged out before deletion', { sessionName: wahaSessionName });
        }
        catch (error) {
            logger_1.default.debug('Failed to logout Waha session (may not exist)', { sessionName: wahaSessionName });
        }
        try {
            const success = await (0, waha_1.deleteWahaSession)(wahaSessionName);
            if (success) {
                deletedFromWaha = true;
                logger_1.default.info('Waha session deleted', { sessionName: wahaSessionName });
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to delete from Waha (may not exist)', { error });
        }
        // Tenta deletar da Evolution
        try {
            await (0, evolution_1.logoutEvolutionInstance)(accountId, instanceName);
            logger_1.default.info('Evolution instance logged out before deletion', { instanceName });
        }
        catch (error) {
            logger_1.default.debug('Failed to logout Evolution instance (may not exist)', { instanceName });
        }
        try {
            const success = await (0, evolution_1.deleteEvolutionInstance)(accountId, instanceName);
            if (success) {
                deletedFromEvolution = true;
                logger_1.default.info('Evolution instance deleted', { instanceName });
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to delete from Evolution (may not exist)', { error });
        }
        // Considera sucesso se deletou de pelo menos um provedor OU deletou o inbox do Chatwoot
        if (deletedFromWaha || deletedFromEvolution || deletedFromUazapi || deletedInbox) {
            res.json({
                success: true,
                message: deleteInbox ? 'Instância e caixa de entrada deletadas com sucesso' : 'Instância deletada com sucesso',
                deletedFrom: {
                    waha: deletedFromWaha,
                    evolution: deletedFromEvolution,
                    uazapi: deletedFromUazapi,
                    chatwootInbox: deletedInbox,
                }
            });
        }
        else {
            // Não encontrou a instância em nenhum provedor.
            // Pode ocorrer quando as credenciais foram removidas mas a conexão ainda aparece na UI.
            // Retorna sucesso para permitir limpeza do estado na interface.
            logger_1.default.warn('Instance not found in any provider during delete (credentials may be missing or instance already removed)', {
                instanceName,
                accountId,
            });
            res.json({
                success: true,
                message: 'Instância removida (não encontrada em nenhum provedor — credenciais ausentes ou instância já deletada)',
                deletedFrom: {
                    waha: false,
                    evolution: false,
                    uazapi: false,
                    chatwootInbox: deletedInbox,
                }
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to delete instance', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao deletar instância' });
    }
});
// Busca informações detalhadas de uma instância
router.get('/instance-info/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        // Verifica se é instância Uazapi (sem try/catch externo para não engolir erros de API)
        const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
            where: {
                accountId_instanceName: {
                    accountId,
                    instanceName,
                },
            },
        });
        if (uazapiInstance) {
            logger_1.default.info('Instance info found in Uazapi', { instanceName, accountId });
            // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
            const uazapiConfig = await resolveUazapiConfig(accountId);
            if (!uazapiConfig) {
                return res.status(400).json({ error: 'Configurações do Uazapi não encontradas. Configure em Config Extra.' });
            }
            // Busca status da instância — erros propagam para o handler principal (retorna 500 com msg clara)
            const uazapiStatus = await (0, uazapi_1.getUazapiInstanceStatus)(uazapiConfig, uazapiInstance.instanceToken);
            const instanceInfo = {
                instanceName: instanceName,
                name: instanceName,
                state: uazapiStatus.instance?.status || 'unknown',
                connectionStatus: uazapiStatus.instance?.status || 'unknown',
                owner: uazapiStatus.instance?.owner || null,
                profileName: uazapiStatus.instance?.profileName || null,
                profilePictureUrl: uazapiStatus.instance?.profilePicUrl || null,
                integration: 'Uazapi',
                provider: 'uazapi',
            };
            return res.json({
                success: true,
                data: instanceInfo
            });
        }
        // Tenta buscar na Waha
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        try {
            const wahaStatus = await (0, waha_1.getWahaSessionStatus)(accountId, wahaSessionName);
            // Se encontrou na Waha, retorna os dados formatados
            if (wahaStatus) {
                logger_1.default.info('Instance info found in Waha', { instanceName, sessionName: wahaSessionName });
                const instanceInfo = {
                    instanceName: instanceName,
                    name: instanceName,
                    state: wahaStatus.status || 'unknown',
                    connectionStatus: wahaStatus.status || 'unknown',
                    owner: wahaStatus.me?.id || null,
                    profileName: wahaStatus.me?.pushName || null,
                    profilePictureUrl: null,
                    integration: 'Waha',
                    provider: 'waha',
                };
                return res.json({
                    success: true,
                    data: instanceInfo
                });
            }
        }
        catch (wahaError) {
            logger_1.default.debug('Instance not found in Waha, trying Evolution', { instanceName, error: wahaError });
        }
        // Se não encontrou na Waha, tenta na Evolution
        const instanceInfo = await (0, evolution_1.getEvolutionInstanceInfo)(accountId, instanceName);
        res.json({
            success: true,
            data: {
                ...instanceInfo,
                provider: 'evolution',
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get instance info', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao obter informações da instância' });
    }
});
// Desconecta (logout) uma instância
router.post('/logout-instance/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        logger_1.default.info('Logging out instance', { instanceName });
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        let loggedOutFromWaha = false;
        let loggedOutFromEvolution = false;
        let loggedOutFromUazapi = false;
        // Tenta logout da Uazapi
        try {
            const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
                where: {
                    accountId_instanceName: {
                        accountId,
                        instanceName,
                    },
                },
            });
            if (uazapiInstance) {
                // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
                const uazapiConfig = await resolveUazapiConfig(accountId);
                if (!uazapiConfig) {
                    throw new Error('Configurações do Uazapi não encontradas. Configure em Config Extra.');
                }
                // Faz logout da instância na Uazapi
                await (0, uazapi_1.logoutUazapiInstance)(uazapiConfig, uazapiInstance.instanceToken);
                loggedOutFromUazapi = true;
                logger_1.default.info('Uazapi instance logged out', { instanceName });
                // Reconecta para gerar novo QR code
                logger_1.default.info('Reconnecting Uazapi instance to generate new QR code', { instanceName });
                await (0, uazapi_1.connectUazapiInstance)(uazapiConfig, uazapiInstance.instanceToken);
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to logout from Uazapi (may not exist)', { error });
        }
        // Tenta logout da Waha
        try {
            const success = await (0, waha_1.logoutWahaSession)(wahaSessionName);
            if (success) {
                loggedOutFromWaha = true;
                logger_1.default.info('Waha session logged out', { sessionName: wahaSessionName });
                // Reinicia a sessão automaticamente para gerar novo QR code
                logger_1.default.info('Restarting Waha session to generate new QR code', { sessionName: wahaSessionName });
                await (0, waha_1.restartWahaSession)(wahaSessionName);
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to logout from Waha (may not exist)', { error });
        }
        // Tenta logout da Evolution
        try {
            const success = await (0, evolution_1.logoutEvolutionInstance)(accountId, instanceName);
            if (success) {
                loggedOutFromEvolution = true;
                logger_1.default.info('Evolution instance logged out', { instanceName });
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to logout from Evolution (may not exist)', { error });
        }
        if (loggedOutFromWaha || loggedOutFromEvolution || loggedOutFromUazapi) {
            res.json({
                success: true,
                message: 'Instância desconectada com sucesso',
                loggedOutFrom: {
                    waha: loggedOutFromWaha,
                    evolution: loggedOutFromEvolution,
                    uazapi: loggedOutFromUazapi,
                }
            });
        }
        else {
            res.status(500).json({ error: 'Erro ao desconectar instância. Instância não encontrada em nenhum provedor.' });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to logout instance', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao desconectar instância' });
    }
});
// Reinicia uma sessão para gerar novo QR code
router.post('/restart-instance/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        logger_1.default.info('Restarting instance to generate new QR', { instanceName });
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        let restartedWaha = false;
        // Tenta reiniciar Waha
        try {
            const success = await (0, waha_1.restartWahaSession)(wahaSessionName);
            if (success) {
                restartedWaha = true;
                logger_1.default.info('Waha session restarted', { sessionName: wahaSessionName });
            }
        }
        catch (error) {
            logger_1.default.debug('Failed to restart Waha session (may not exist)', { error });
        }
        // TODO: Adicionar suporte para Evolution se necessário
        if (restartedWaha) {
            res.json({
                success: true,
                message: 'Sessão reiniciada. Gerando novo QR code...',
            });
        }
        else {
            res.status(500).json({ error: 'Erro ao reiniciar instância' });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to restart instance', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao reiniciar instância' });
    }
});
// Busca configurações de uma sessão Waha
router.get('/waha-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        logger_1.default.info('Fetching Waha session config', { instanceName, sessionName: wahaSessionName, accountId });
        const config = await (0, waha_1.getWahaSessionConfig)(wahaSessionName, accountId);
        res.json({
            success: true,
            data: config
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get Waha session config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao buscar configurações da sessão' });
    }
});
// Atualiza configurações de uma sessão Waha
router.patch('/waha-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        const { agentName, ignoreGroups, ignoreChannels, ignoreBroadcast, rejectCalls, callMessage } = req.body;
        const wahaSessionName = `Whatsapp_${instanceName}_CWID_${accountId}`;
        logger_1.default.info('Updating Waha session config', {
            instanceName,
            sessionName: wahaSessionName,
            config: { agentName, ignoreGroups, ignoreChannels, ignoreBroadcast, rejectCalls, callMessage }
        });
        const updatedConfig = await (0, waha_1.updateWahaSessionConfig)(wahaSessionName, accountId, {
            agentName,
            ignoreGroups,
            ignoreChannels,
            ignoreBroadcast,
            rejectCalls,
            callMessage,
        });
        res.json({
            success: true,
            data: updatedConfig,
            message: 'Configurações atualizadas com sucesso'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update Waha Chatwoot app config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao atualizar configurações da sessão' });
    }
});
// Busca configurações de uma instância Evolution
router.get('/evolution-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const { instanceName } = req.params;
        const accountId = authReq.user.account_id;
        logger_1.default.info('Fetching Evolution instance config', { instanceName });
        // Busca configurações do Chatwoot e da instância
        const [chatwootConfig, instanceSettings] = await Promise.all([
            (0, evolution_1.getEvolutionChatwootSettings)(accountId, instanceName).catch(() => ({})),
            (0, evolution_1.getEvolutionInstanceSettings)(accountId, instanceName).catch(() => ({}))
        ]);
        // Formata resposta similar ao Waha
        const config = {
            agentName: chatwootConfig.signMsg || false,
            ignoreGroups: instanceSettings.groupsIgnore || false,
            rejectCalls: instanceSettings.rejectCall || false,
            msgCall: instanceSettings.msgCall || '',
            alwaysOnline: instanceSettings.alwaysOnline || false,
            readMessages: instanceSettings.readMessages || false,
            readStatus: instanceSettings.readStatus || false,
        };
        res.json({
            success: true,
            data: config
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get Evolution instance config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao buscar configurações da instância' });
    }
});
// Atualiza configurações de uma instância Evolution
router.patch('/evolution-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const { instanceName } = req.params;
        const accountId = authReq.user.account_id;
        const { agentName, ignoreGroups, rejectCalls, msgCall, alwaysOnline, readMessages, readStatus } = req.body;
        logger_1.default.info('Updating Evolution instance config', {
            instanceName,
            config: { agentName, ignoreGroups, rejectCalls, msgCall, alwaysOnline, readMessages, readStatus }
        });
        // Busca configurações atuais para fazer merge
        const [currentChatwootConfig, currentInstanceSettings] = await Promise.all([
            (0, evolution_1.getEvolutionChatwootSettings)(accountId, instanceName).catch(() => ({})),
            (0, evolution_1.getEvolutionInstanceSettings)(accountId, instanceName).catch(() => ({}))
        ]);
        logger_1.default.info('Current Evolution configs fetched', {
            instanceName,
            currentChatwootConfig,
            currentInstanceSettings
        });
        // Atualiza configurações do Chatwoot (agentName = signMsg)
        if (agentName !== undefined) {
            // Merge com configurações atuais
            const chatwootPayload = {
                ...currentChatwootConfig,
                signMsg: agentName
            };
            logger_1.default.info('Updating Chatwoot settings with payload', { instanceName, chatwootPayload });
            await (0, evolution_1.updateEvolutionChatwootSettings)(accountId, instanceName, chatwootPayload);
        }
        // Atualiza configurações da instância
        const settingsToUpdate = {};
        if (ignoreGroups !== undefined)
            settingsToUpdate.groupsIgnore = ignoreGroups;
        if (rejectCalls !== undefined)
            settingsToUpdate.rejectCall = rejectCalls;
        if (msgCall !== undefined)
            settingsToUpdate.msgCall = msgCall;
        if (alwaysOnline !== undefined)
            settingsToUpdate.alwaysOnline = alwaysOnline;
        if (readMessages !== undefined)
            settingsToUpdate.readMessages = readMessages;
        if (readStatus !== undefined)
            settingsToUpdate.readStatus = readStatus;
        if (Object.keys(settingsToUpdate).length > 0) {
            // Merge com configurações atuais
            const instancePayload = {
                ...currentInstanceSettings,
                ...settingsToUpdate
            };
            logger_1.default.info('Updating instance settings with payload', { instanceName, instancePayload });
            await (0, evolution_1.updateEvolutionInstanceSettings)(accountId, instanceName, instancePayload);
        }
        res.json({
            success: true,
            message: 'Configurações atualizadas com sucesso'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update Evolution instance config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao atualizar configurações da instância' });
    }
});
// Busca configurações do Uazapi da conta
router.get('/uazapi-config', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        logger_1.default.info('Fetching Uazapi config', { accountId });
        const config = await database_1.default.uazapiConfig.findUnique({
            where: { accountId },
        });
        if (config) {
            res.json({
                success: true,
                data: {
                    baseUrl: config.baseUrl,
                    adminToken: config.adminToken,
                }
            });
        }
        else {
            // Retorna variáveis de ambiente como fallback (se existirem)
            if (process.env.UAZAPI_BASE_URL && process.env.UAZAPI_ADMIN_TOKEN) {
                res.json({
                    success: true,
                    data: {
                        baseUrl: process.env.UAZAPI_BASE_URL,
                        adminToken: process.env.UAZAPI_ADMIN_TOKEN,
                    },
                    isGlobal: true,
                });
            }
            else {
                res.json({
                    success: true,
                    data: null
                });
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get Uazapi config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao buscar configurações do Uazapi' });
    }
});
// Salva/atualiza configurações do Uazapi da conta
router.post('/uazapi-config', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { baseUrl, adminToken } = req.body;
        if (!baseUrl || !adminToken) {
            return res.status(400).json({
                error: 'baseUrl e adminToken são obrigatórios'
            });
        }
        logger_1.default.info('Saving Uazapi config', { accountId, baseUrl });
        const config = await database_1.default.uazapiConfig.upsert({
            where: { accountId },
            create: {
                accountId,
                baseUrl,
                adminToken,
            },
            update: {
                baseUrl,
                adminToken,
            },
        });
        res.json({
            success: true,
            message: 'Configurações do Uazapi salvas com sucesso',
            data: {
                baseUrl: config.baseUrl,
                adminToken: config.adminToken,
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to save Uazapi config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao salvar configurações do Uazapi' });
    }
});
// Busca configurações de uma instância Uazapi
router.get('/uazapi-instance-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        logger_1.default.info('Fetching Uazapi instance config', { instanceName, accountId });
        // Busca a instância no banco
        const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
            where: {
                accountId_instanceName: {
                    accountId,
                    instanceName,
                },
            },
        });
        if (!uazapiInstance) {
            return res.status(404).json({ error: 'Instância não encontrada' });
        }
        // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
        const uazapiConfig = await resolveUazapiConfig(accountId);
        if (!uazapiConfig) {
            return res.status(400).json({ error: 'Configurações do Uazapi não encontradas. Configure em Config Extra.' });
        }
        // Busca configurações do Chatwoot na API do Uazapi
        const url = `${uazapiConfig.baseUrl}/chatwoot/config`;
        logger_1.default.info('Fetching config from Uazapi API', {
            url,
            instanceName,
            hasToken: !!uazapiInstance.instanceToken
        });
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'token': uazapiInstance.instanceToken,
            },
        });
        logger_1.default.info('Uazapi API response', {
            status: response.status,
            statusText: response.statusText,
            instanceName
        });
        if (!response.ok) {
            const errorText = await response.text();
            logger_1.default.error('Uazapi API error response', { status: response.status, body: errorText });
            throw new Error(`Failed to fetch Uazapi config: ${response.statusText}`);
        }
        const chatwootConfig = await response.json();
        logger_1.default.info('Uazapi config loaded', {
            config: chatwootConfig,
            instanceName
        });
        const config = {
            ignoreGroups: chatwootConfig.ignore_groups || false,
            signMessages: chatwootConfig.sign_messages || false,
            createNewConversation: chatwootConfig.create_new_conversation || false,
        };
        res.json({
            success: true,
            data: config
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to get Uazapi instance config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao buscar configurações da instância' });
    }
});
// Atualiza configurações de uma instância Uazapi
router.patch('/uazapi-instance-config/:instanceName', async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { instanceName } = req.params;
        const { ignoreGroups, signMessages, createNewConversation } = req.body;
        logger_1.default.info('Updating Uazapi instance config', {
            instanceName,
            accountId,
            config: { ignoreGroups, signMessages, createNewConversation }
        });
        // Busca a instância no banco
        const uazapiInstance = await database_1.default.uazapiInstance.findUnique({
            where: {
                accountId_instanceName: {
                    accountId,
                    instanceName,
                },
            },
        });
        if (!uazapiInstance) {
            return res.status(404).json({ error: 'Instância não encontrada' });
        }
        // Busca configurações do Uazapi (tabela → SystemSettings → env vars)
        const uazapiConfig = await resolveUazapiConfig(accountId);
        if (!uazapiConfig) {
            return res.status(400).json({ error: 'Configurações do Uazapi não encontradas. Configure em Config Extra.' });
        }
        // Busca configurações atuais do Chatwoot
        const getUrl = `${uazapiConfig.baseUrl}/chatwoot/config`;
        logger_1.default.info('Fetching current config from Uazapi API for update', {
            url: getUrl,
            instanceName
        });
        const getCurrentResponse = await fetch(getUrl, {
            headers: {
                'Content-Type': 'application/json',
                'token': uazapiInstance.instanceToken,
            },
        });
        if (!getCurrentResponse.ok) {
            const errorText = await getCurrentResponse.text();
            logger_1.default.error('Uazapi API error on GET', { status: getCurrentResponse.status, body: errorText });
            throw new Error(`Failed to fetch current Uazapi config: ${getCurrentResponse.statusText}`);
        }
        const currentConfig = await getCurrentResponse.json();
        logger_1.default.info('Current Uazapi config fetched', { currentConfig });
        // Mescla com as novas configurações
        const updatedConfig = {
            ...currentConfig,
            ignore_groups: ignoreGroups !== undefined ? ignoreGroups : currentConfig.ignore_groups,
            sign_messages: signMessages !== undefined ? signMessages : currentConfig.sign_messages,
            create_new_conversation: createNewConversation !== undefined ? createNewConversation : currentConfig.create_new_conversation,
        };
        // Atualiza as configurações na API do Uazapi
        const putUrl = `${uazapiConfig.baseUrl}/chatwoot/config`;
        logger_1.default.info('Updating Uazapi config via PUT', {
            url: putUrl,
            config: updatedConfig,
            instanceName
        });
        const putResponse = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'token': uazapiInstance.instanceToken,
            },
            body: JSON.stringify(updatedConfig),
        });
        if (!putResponse.ok) {
            const errorText = await putResponse.text();
            logger_1.default.error('Uazapi API error on PUT', { status: putResponse.status, body: errorText });
            throw new Error(`Failed to update Uazapi config: ${putResponse.statusText}`);
        }
        logger_1.default.info('Uazapi instance config updated successfully', { instanceName });
        res.json({
            success: true,
            data: { ignoreGroups, signMessages, createNewConversation },
            message: 'Configurações atualizadas com sucesso'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to update Uazapi instance config', { error: errorMessage });
        res.status(500).json({ error: 'Erro ao atualizar configurações da instância' });
    }
});
exports.default = router;
//# sourceMappingURL=connections.js.map