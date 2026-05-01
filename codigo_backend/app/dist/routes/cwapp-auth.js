"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const auth_1 = require("../middleware/auth");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    try {
        const chatwootUrl = process.env.CHATWOOT_API_URL;
        const response = await axios_1.default.post(`${chatwootUrl}/auth/sign_in`, { email, password });
        const headers = response.headers;
        const data = response.data?.data;
        if (!data) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        res.json({
            accessToken: headers['access-token'],
            client: headers['client'],
            uid: headers['uid'],
            tokenType: headers['token-type'],
            expiry: headers['expiry'],
            userId: data.id,
            accountId: data.account_id,
            name: data.name,
            email: data.email,
            avatarUrl: data.avatar_url,
            role: data.role,
        });
    }
    catch (error) {
        logger_1.default.error('CWApp login failed', { error: error.message });
        const status = error.response?.status || 500;
        res.status(status).json({ error: 'Credenciais inválidas' });
    }
});
router.get('/me', auth_1.validateAuth, async (req, res) => {
    const authReq = req;
    try {
        const profile = await chatwoot_1.default.getUserProfile(authReq.jwt, authReq.apiToken);
        res.json({
            userId: profile.id,
            accountId: profile.account_id,
            name: profile.name,
            email: profile.email,
            avatarUrl: profile.avatar_url,
            role: profile.role,
        });
    }
    catch (error) {
        logger_1.default.error('CWApp /me failed', { error: error.message });
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
});
exports.default = router;
//# sourceMappingURL=cwapp-auth.js.map