"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChatwootDashboardScript = updateChatwootDashboardScript;
exports.applyDashboardScriptOnStartup = applyDashboardScriptOnStartup;
const pg_1 = require("pg");
const fs_1 = require("fs");
const path_1 = require("path");
const logger_1 = __importDefault(require("../utils/logger"));
const systemSettings_1 = require("./systemSettings");
/**
 * Gera o conteúdo do Dashboard Script do Chatwoot
 */
function generateDashboardScript(kanbancwUrl) {
    const templatePath = (0, path_1.join)(__dirname, '../../chatwoot-dashboard-script.template.html');
    const template = (0, fs_1.readFileSync)(templatePath, 'utf-8');
    // Substitui a URL no template
    return template.replace(/__KANBANCW_URL__/g, kanbancwUrl);
}
/**
 * Atualiza o Dashboard Script diretamente no banco do Chatwoot
 */
async function updateChatwootDashboardScript(accountId, kanbancwUrl, chatwootDatabaseUrl) {
    let client = null;
    try {
        // Usa connection string fornecida, variável de ambiente, ou busca das configurações
        let finalDatabaseUrl = chatwootDatabaseUrl;
        if (!finalDatabaseUrl && process.env.CHATWOOT_DATABASE_URL) {
            finalDatabaseUrl = process.env.CHATWOOT_DATABASE_URL;
            logger_1.default.info('Usando CHATWOOT_DATABASE_URL da variável de ambiente');
        }
        if (!finalDatabaseUrl) {
            try {
                const settings = await (0, systemSettings_1.getSystemSettings)(accountId);
                finalDatabaseUrl = settings.chatwootDatabaseUrl;
                logger_1.default.info('Usando CHATWOOT_DATABASE_URL das configurações do sistema');
            }
            catch (error) {
                logger_1.default.warn('Não foi possível buscar configurações do sistema', { error });
            }
        }
        if (!finalDatabaseUrl) {
            logger_1.default.error('CHATWOOT_DATABASE_URL não configurado', {
                hasEnvVar: !!process.env.CHATWOOT_DATABASE_URL,
                accountId
            });
            return {
                success: false,
                message: 'Chatwoot Database URL não configurado'
            };
        }
        // URL do KanbanCW (deriva do domínio ou usa variável direta)
        let finalKanbancwUrl = kanbancwUrl;
        if (!finalKanbancwUrl) {
            // Tenta KANBANCW_URL primeiro (se já derivado no entrypoint)
            if (process.env.KANBANCW_URL) {
                finalKanbancwUrl = process.env.KANBANCW_URL;
            }
            // Senão, deriva do KANBANCW_DOMAIN
            else if (process.env.KANBANCW_DOMAIN) {
                const domain = process.env.KANBANCW_DOMAIN;
                finalKanbancwUrl = domain.startsWith('http') ? domain : `https://${domain}`;
            }
            // Fallback para VITE_API_URL
            else if (process.env.VITE_API_URL) {
                finalKanbancwUrl = process.env.VITE_API_URL;
            }
        }
        if (!finalKanbancwUrl) {
            logger_1.default.error('Nenhuma URL do KanbanCW encontrada', {
                KANBANCW_URL: process.env.KANBANCW_URL,
                KANBANCW_DOMAIN: process.env.KANBANCW_DOMAIN,
                VITE_API_URL: process.env.VITE_API_URL
            });
            return {
                success: false,
                message: 'KANBANCW_URL ou KANBANCW_DOMAIN não configurado'
            };
        }
        logger_1.default.info('🔧 URL do KanbanCW para Dashboard Script', {
            url: finalKanbancwUrl,
            source: process.env.KANBANCW_URL ? 'KANBANCW_URL' :
                process.env.KANBANCW_DOMAIN ? 'KANBANCW_DOMAIN' : 'VITE_API_URL',
            env: {
                KANBANCW_URL: process.env.KANBANCW_URL || 'not set',
                KANBANCW_DOMAIN: process.env.KANBANCW_DOMAIN || 'not set',
                VITE_API_URL: process.env.VITE_API_URL || 'not set'
            }
        });
        // Gera o script
        const scriptContent = generateDashboardScript(finalKanbancwUrl);
        // Conecta no banco do Chatwoot
        logger_1.default.info('Tentando conectar no Chatwoot DB', {
            host: finalDatabaseUrl?.split('@')[1]?.split(':')[0] || 'unknown',
            dbExists: !!finalDatabaseUrl
        });
        client = new pg_1.Client({
            connectionString: finalDatabaseUrl
        });
        await client.connect();
        logger_1.default.info('Conexão com Chatwoot DB estabelecida com sucesso');
        // Verifica se já existe um Dashboard Script (independente de locked)
        const checkQuery = `
      SELECT id, serialized_value, locked
      FROM installation_configs
      WHERE name = 'DASHBOARD_SCRIPTS'
    `;
        const result = await client.query(checkQuery);
        // O Rails espera uma STRING YAML dentro do campo JSONB
        // Formato: "--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\nvalue: CONTENT\n"
        // Precisamos escapar o conteúdo do script para YAML
        const escapedContent = scriptContent
            .replace(/\\/g, '\\\\') // Escapa backslashes
            .replace(/"/g, '\\"') // Escapa aspas duplas
            .replace(/\n/g, '\\n') // Escapa newlines
            .replace(/\r/g, '\\r'); // Escapa carriage returns
        // Cria a string YAML no formato esperado pelo Rails
        const yamlString = `--- !ruby/hash:ActiveSupport::HashWithIndifferentAccess\nvalue: "${escapedContent}"\n`;
        // Salva a string YAML como valor JSON
        const scriptValue = JSON.stringify(yamlString);
        // Upsert atômico — evita race condition entre verificação e insert
        const upsertQuery = `
      INSERT INTO installation_configs (name, serialized_value, locked, created_at, updated_at)
      VALUES ('DASHBOARD_SCRIPTS', $1::jsonb, false, NOW(), NOW())
      ON CONFLICT (name)
      DO UPDATE SET serialized_value = EXCLUDED.serialized_value, updated_at = NOW()
    `;
        await client.query(upsertQuery, [scriptValue]);
        const wasUpdate = result.rows.length > 0;
        logger_1.default.info(wasUpdate ? 'Dashboard Script atualizado no Chatwoot' : 'Dashboard Script criado no Chatwoot', { accountId });
        await client.end();
        return {
            success: true,
            message: 'Dashboard Script atualizado com sucesso no Chatwoot'
        };
    }
    catch (error) {
        logger_1.default.error('Erro ao atualizar Dashboard Script no Chatwoot', { error, accountId });
        if (client) {
            try {
                await client.end();
            }
            catch (e) {
                // Ignora erro ao fechar conexão
            }
        }
        return {
            success: false,
            message: `Erro: ${error.message}`
        };
    }
}
/**
 * Aplica o Dashboard Script automaticamente no startup.
 * O Dashboard Script é um registro GLOBAL na tabela installation_configs do Chatwoot
 * (campo DASHBOARD_SCRIPTS), aplicado a todos os usuários de todas as contas.
 * O accountId=1 é usado apenas como referência para buscar a URL nas configurações do sistema;
 * não limita a aplicação do script a uma conta específica.
 */
async function applyDashboardScriptOnStartup() {
    try {
        const result = await updateChatwootDashboardScript(1);
        if (result.success) {
            logger_1.default.info('✅ Dashboard Script aplicado com sucesso no startup');
        }
        else {
            logger_1.default.warn('⚠️ Falha ao aplicar Dashboard Script no startup', { message: result.message });
        }
    }
    catch (error) {
        logger_1.default.error('❌ Erro ao aplicar Dashboard Script no startup', { error: error.message });
    }
}
//# sourceMappingURL=chatwootDashboardScript.js.map