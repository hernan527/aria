"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDecryptedCredential = getDecryptedCredential;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../services/database"));
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// Chave de criptografia (usar env var em produção)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'kanbancw-ai-credentials-secret-key-32b';
const ALGORITHM = 'aes-256-cbc';
// Função para criptografar API key
function encrypt(text) {
    const key = crypto_1.default.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
// Função para descriptografar API key
function decrypt(encrypted) {
    const key = crypto_1.default.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// Listar credenciais configuradas (sem expor as keys)
router.get('/ai-credentials', auth_1.validateAuth, async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const credentials = await database_1.default.aICredentials.findMany({
            where: { accountId, isActive: true },
            select: {
                id: true,
                provider: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json({ data: credentials });
    }
    catch (error) {
        console.error('[AI-CREDENTIALS] Erro ao listar credenciais:', error);
        res.status(500).json({ error: 'Erro ao listar credenciais' });
    }
});
// Adicionar ou atualizar credencial
router.post('/ai-credentials', auth_1.validateAuth, async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { provider, apiKey } = req.body;
        if (!provider || !apiKey) {
            return res.status(400).json({ error: 'Provider e apiKey são obrigatórios' });
        }
        if (!['openai', 'groq', 'openrouter'].includes(provider)) {
            return res.status(400).json({ error: 'Provider deve ser "openai", "groq" ou "openrouter"' });
        }
        // Criptografar a API key
        const encryptedKey = encrypt(apiKey);
        // Upsert (criar ou atualizar)
        const credential = await database_1.default.aICredentials.upsert({
            where: {
                accountId_provider: {
                    accountId,
                    provider,
                },
            },
            update: {
                apiKey: encryptedKey,
                isActive: true,
                updatedAt: new Date(),
            },
            create: {
                accountId,
                provider,
                apiKey: encryptedKey,
                isActive: true,
            },
        });
        res.json({
            message: 'Credencial salva com sucesso',
            data: {
                id: credential.id,
                provider: credential.provider,
                isActive: credential.isActive,
            },
        });
    }
    catch (error) {
        console.error('[AI-CREDENTIALS] Erro ao salvar credencial:', error);
        res.status(500).json({ error: 'Erro ao salvar credencial' });
    }
});
// Deletar credencial
router.delete('/ai-credentials/:provider', auth_1.validateAuth, async (req, res) => {
    try {
        const authReq = req;
        const accountId = authReq.user.account_id;
        const { provider } = req.params;
        if (!['openai', 'groq', 'openrouter'].includes(provider)) {
            return res.status(400).json({ error: 'Provider inválido' });
        }
        await database_1.default.aICredentials.deleteMany({
            where: {
                accountId,
                provider,
            },
        });
        res.json({ message: 'Credencial removida com sucesso' });
    }
    catch (error) {
        console.error('[AI-CREDENTIALS] Erro ao deletar credencial:', error);
        res.status(500).json({ error: 'Erro ao deletar credencial' });
    }
});
// Função helper para buscar credencial descriptografada (uso interno)
async function getDecryptedCredential(accountId, provider) {
    try {
        const credential = await database_1.default.aICredentials.findUnique({
            where: {
                accountId_provider: {
                    accountId,
                    provider,
                },
                isActive: true,
            },
        });
        if (!credential) {
            return null;
        }
        return decrypt(credential.apiKey);
    }
    catch (error) {
        console.error('[AI-CREDENTIALS] Erro ao buscar credencial:', error);
        return null;
    }
}
exports.default = router;
//# sourceMappingURL=ai-credentials.js.map