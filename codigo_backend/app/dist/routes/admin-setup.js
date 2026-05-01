"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const systemSettings_1 = require("../services/systemSettings");
const chatwootDashboardScript_1 = require("../services/chatwootDashboardScript");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
/**
 * GET /api/admin/setup
 * Busca as configurações de sistema da conta
 * Apenas SuperAdmin pode acessar
 */
router.get('/', auth_1.validateAuth, async (req, res) => {
    try {
        // Verifica se é SuperAdmin
        const profile = await chatwoot_1.default.getUserProfile(req.jwt, req.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Apenas SuperAdmin pode acessar esta página' });
        }
        const accountId = profile.account_id;
        const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
        // Retorna as configurações (sem as partes sensíveis mascaradas para o frontend)
        const response = {};
        if (settings.evolutionApiUrl) {
            response.evolutionApiUrl = settings.evolutionApiUrl;
        }
        if (settings.evolutionApiKey) {
            response.evolutionApiKey = maskSensitive(settings.evolutionApiKey);
        }
        if (settings.wahaApiUrl) {
            response.wahaApiUrl = settings.wahaApiUrl;
        }
        if (settings.wahaApiKey) {
            response.wahaApiKey = maskSensitive(settings.wahaApiKey);
        }
        if (settings.uazapiBaseUrl) {
            response.uazapiBaseUrl = settings.uazapiBaseUrl;
        }
        if (settings.uazapiAdminToken) {
            response.uazapiAdminToken = maskSensitive(settings.uazapiAdminToken);
        }
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Failed to get system settings', { error });
        res.status(500).json({ error: 'Failed to get system settings' });
    }
});
/**
 * POST /api/admin/setup
 * Salva as configurações de sistema da conta
 * Apenas SuperAdmin pode acessar
 */
router.post('/', auth_1.validateAuth, async (req, res) => {
    try {
        // Verifica se é SuperAdmin
        const profile = await chatwoot_1.default.getUserProfile(req.jwt, req.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Apenas SuperAdmin pode acessar esta página' });
        }
        const accountId = profile.account_id;
        // IMPORTANTE: Carrega configurações existentes ANTES de fazer merge
        // Isso garante que valores vazios não sobrescrevem configurações existentes
        const existingSettings = await (0, systemSettings_1.getSystemSettings)(accountId);
        const settings = {};
        // Validação e sanitização dos dados
        // IMPORTANTE: Só inclui campos que têm valor E são diferentes dos existentes
        // Evolution API URL
        if (req.body.evolutionApiUrl !== undefined) {
            const trimmed = req.body.evolutionApiUrl?.trim();
            if (trimmed) {
                if (!isValidUrl(trimmed)) {
                    return res.status(400).json({ error: 'Invalid Evolution API URL format' });
                }
                settings.evolutionApiUrl = trimmed;
            }
            else if (req.body.evolutionApiUrl === null || req.body.evolutionApiUrl === '') {
                // Se enviou explicitamente null ou vazio, mantém o valor existente
                if (existingSettings.evolutionApiUrl) {
                    settings.evolutionApiUrl = existingSettings.evolutionApiUrl;
                }
            }
        }
        // Evolution API Key
        if (req.body.evolutionApiKey !== undefined) {
            const trimmed = req.body.evolutionApiKey?.trim();
            // Se o campo está mascarado (tem ••••), mantém o valor existente
            if (trimmed && !trimmed.includes('••••')) {
                settings.evolutionApiKey = trimmed;
            }
            else if (!trimmed) {
                if (existingSettings.evolutionApiKey) {
                    settings.evolutionApiKey = existingSettings.evolutionApiKey;
                }
            }
        }
        // Waha API URL
        if (req.body.wahaApiUrl !== undefined) {
            const trimmed = req.body.wahaApiUrl?.trim();
            if (trimmed) {
                if (!isValidUrl(trimmed)) {
                    return res.status(400).json({ error: 'Invalid WAHA API URL format' });
                }
                settings.wahaApiUrl = trimmed;
            }
            else if (req.body.wahaApiUrl === null || req.body.wahaApiUrl === '') {
                if (existingSettings.wahaApiUrl) {
                    settings.wahaApiUrl = existingSettings.wahaApiUrl;
                }
            }
        }
        // Waha API Key
        if (req.body.wahaApiKey !== undefined) {
            const trimmed = req.body.wahaApiKey?.trim();
            if (trimmed && !trimmed.includes('••••')) {
                settings.wahaApiKey = trimmed;
            }
            else if (!trimmed) {
                if (existingSettings.wahaApiKey) {
                    settings.wahaApiKey = existingSettings.wahaApiKey;
                }
            }
        }
        // Uazapi Base URL
        if (req.body.uazapiBaseUrl !== undefined) {
            const trimmed = req.body.uazapiBaseUrl?.trim();
            if (trimmed) {
                if (!isValidUrl(trimmed)) {
                    return res.status(400).json({ error: 'Invalid UaZapi Base URL format' });
                }
                settings.uazapiBaseUrl = trimmed;
            }
            else if (req.body.uazapiBaseUrl === null || req.body.uazapiBaseUrl === '') {
                if (existingSettings.uazapiBaseUrl) {
                    settings.uazapiBaseUrl = existingSettings.uazapiBaseUrl;
                }
            }
        }
        // Uazapi Admin Token
        if (req.body.uazapiAdminToken !== undefined) {
            const trimmed = req.body.uazapiAdminToken?.trim();
            if (trimmed && !trimmed.includes('••••')) {
                settings.uazapiAdminToken = trimmed;
            }
            else if (!trimmed) {
                if (existingSettings.uazapiAdminToken) {
                    settings.uazapiAdminToken = existingSettings.uazapiAdminToken;
                }
            }
        }
        // Salva nas configurações da conta do SuperAdmin
        await (0, systemSettings_1.saveSystemSettings)(accountId, settings);
        // Salva também no registro global (accountId=0) para que todas as outras contas
        // herdem as URLs de provider quando não tiverem configuração própria
        const globalProviderSettings = {};
        if (settings.evolutionApiUrl !== undefined)
            globalProviderSettings.evolutionApiUrl = settings.evolutionApiUrl;
        if (settings.evolutionApiKey !== undefined)
            globalProviderSettings.evolutionApiKey = settings.evolutionApiKey;
        if (settings.wahaApiUrl !== undefined)
            globalProviderSettings.wahaApiUrl = settings.wahaApiUrl;
        if (settings.wahaApiKey !== undefined)
            globalProviderSettings.wahaApiKey = settings.wahaApiKey;
        if (settings.uazapiBaseUrl !== undefined)
            globalProviderSettings.uazapiBaseUrl = settings.uazapiBaseUrl;
        if (settings.uazapiAdminToken !== undefined)
            globalProviderSettings.uazapiAdminToken = settings.uazapiAdminToken;
        if (Object.keys(globalProviderSettings).length > 0) {
            await (0, systemSettings_1.saveSystemSettings)(0, globalProviderSettings);
        }
        res.json({ success: true, message: 'System settings saved successfully' });
    }
    catch (error) {
        logger_1.default.error('Failed to save system settings', { error });
        res.status(500).json({ error: 'Failed to save system settings' });
    }
});
/**
 * POST /api/admin/setup/test-connection
 * Testa a conexão com uma API externa
 * Apenas SuperAdmin pode acessar
 */
router.post('/test-connection', auth_1.validateAuth, async (req, res) => {
    try {
        // Verifica se é SuperAdmin
        const profile = await chatwoot_1.default.getUserProfile(req.jwt, req.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Apenas SuperAdmin pode acessar esta página' });
        }
        const { provider, url, apiKey } = req.body;
        if (!provider || !url) {
            return res.status(400).json({ error: 'Provider and URL are required' });
        }
        // Testa a conexão de acordo com o provedor
        let result;
        switch (provider) {
            case 'evolution':
                result = await testEvolutionConnection(url, apiKey);
                break;
            case 'waha':
                result = await testWahaConnection(url, apiKey);
                break;
            case 'uazapi':
                result = await testUazapiConnection(url, apiKey);
                break;
            case 'chatwoot-db':
                result = await testChatwootDbConnection(url);
                break;
            default:
                return res.status(400).json({ error: 'Invalid provider' });
        }
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('Failed to test connection', { error });
        res.status(500).json({ success: false, message: 'Connection test failed' });
    }
});
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Mascara valores sensíveis para exibição no frontend
 * Mostra apenas os primeiros e últimos 4 caracteres
 */
function maskSensitive(value) {
    if (!value || value.length <= 8) {
        return '••••••••';
    }
    const start = value.slice(0, 4);
    const end = value.slice(-4);
    return `${start}••••${end}`;
}
/**
 * Valida se uma string é uma URL válida
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Testa conexão com Evolution API
 */
async function testEvolutionConnection(url, apiKey) {
    try {
        const response = await fetch(`${url}/instance/fetchInstances`, {
            method: 'GET',
            headers: {
                'apikey': apiKey || '',
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            return { success: true, message: 'Connection successful' };
        }
        else {
            return { success: false, message: `Connection failed: ${response.statusText}` };
        }
    }
    catch (error) {
        return { success: false, message: `Connection error: ${error.message}` };
    }
}
/**
 * Testa conexão com WAHA
 */
async function testWahaConnection(url, apiKey) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['X-Api-Key'] = apiKey;
        }
        const response = await fetch(`${url}/api/sessions`, {
            method: 'GET',
            headers
        });
        if (response.ok) {
            return { success: true, message: 'Connection successful' };
        }
        else {
            return { success: false, message: `Connection failed: ${response.statusText}` };
        }
    }
    catch (error) {
        return { success: false, message: `Connection error: ${error.message}` };
    }
}
/**
 * Testa conexão com UaZapi
 */
async function testUazapiConnection(url, adminToken) {
    try {
        const response = await fetch(`${url}/instances`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'adminToken': adminToken || ''
            }
        });
        if (response.ok) {
            return { success: true, message: 'Connection successful' };
        }
        else {
            return { success: false, message: `Connection failed: ${response.statusText}` };
        }
    }
    catch (error) {
        return { success: false, message: `Connection error: ${error.message}` };
    }
}
/**
 * Testa conexão com banco de dados Chatwoot
 */
async function testChatwootDbConnection(databaseUrl) {
    try {
        // Importa postgres dinâmicamente para não quebrar se não estiver instalado
        const { Client } = require('pg');
        const client = new Client({ connectionString: databaseUrl });
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
        return { success: true, message: 'Connection successful' };
    }
    catch (error) {
        return { success: false, message: `Connection error: ${error.message}` };
    }
}
/**
 * POST /api/admin/setup/apply-dashboard-script
 * Aplica o Dashboard Script no banco do Chatwoot
 * Apenas SuperAdmin pode acessar
 */
router.post('/apply-dashboard-script', auth_1.validateAuth, async (req, res) => {
    try {
        // Verifica se é SuperAdmin
        const profile = await chatwoot_1.default.getUserProfile(req.jwt, req.apiToken);
        if (profile.type !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Apenas SuperAdmin pode acessar esta página' });
        }
        const accountId = profile.account_id;
        const { kanbancwUrl } = req.body;
        const result = await (0, chatwootDashboardScript_1.updateChatwootDashboardScript)(accountId, kanbancwUrl);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(500).json(result);
        }
    }
    catch (error) {
        logger_1.default.error('Failed to apply dashboard script', { error });
        res.status(500).json({ success: false, message: 'Failed to apply dashboard script' });
    }
});
exports.default = router;
//# sourceMappingURL=admin-setup.js.map