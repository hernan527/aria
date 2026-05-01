"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.encryptOptional = encryptOptional;
exports.decryptOptional = decryptOptional;
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recomendado para GCM
/**
 * Chave de 32 bytes derivada da variável de ambiente ENCRYPTION_KEY.
 * Se não configurada, deriva automaticamente da DATABASE_URL (única por servidor).
 */
function getEncryptionKey() {
    const raw = process.env.ENCRYPTION_KEY;
    if (raw) {
        const key = Buffer.from(raw, 'hex');
        if (key.length !== 32) {
            throw new Error('ENCRYPTION_KEY deve ser uma string hex de 64 caracteres (32 bytes)');
        }
        return key;
    }
    // Fallback: deriva chave da DATABASE_URL (única por servidor/banco)
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('[encryption] ENCRYPTION_KEY não configurada — derivando chave da DATABASE_URL. Recomendado definir ENCRYPTION_KEY explicitamente.');
        }
        return (0, crypto_1.createHash)('sha256').update(dbUrl).digest();
    }
    // Último fallback: chave de desenvolvimento
    console.warn('[encryption] ENCRYPTION_KEY e DATABASE_URL não configuradas — usando chave de desenvolvimento. NÃO use em produção!');
    return Buffer.from('dev-key-do-not-use-in-production!!', 'utf8').subarray(0, 32);
}
/**
 * Criptografa um valor em string usando AES-256-GCM.
 * Retorna uma string no formato: iv:authTag:ciphertext (hex)
 */
function encrypt(plaintext) {
    const key = getEncryptionKey();
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
/**
 * Descriptografa um valor previamente criptografado por `encrypt()`.
 * Retorna null se o valor não estiver no formato esperado (ex: dados legados não criptografados).
 */
function decrypt(ciphertext) {
    // Valores legados (não criptografados) não contêm ':' no formato iv:tag:data
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
        // Dado não criptografado — retorna como está (compatibilidade com dados legados)
        return ciphertext;
    }
    try {
        const key = getEncryptionKey();
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
    }
    catch {
        // Se falhar (chave errada, dado corrompido), retorna null
        return null;
    }
}
/**
 * Criptografa apenas se o valor não for null/undefined.
 */
function encryptOptional(value) {
    if (!value)
        return null;
    return encrypt(value);
}
/**
 * Descriptografa apenas se o valor não for null/undefined.
 */
function decryptOptional(value) {
    if (!value)
        return null;
    return decrypt(value);
}
//# sourceMappingURL=encryption.js.map