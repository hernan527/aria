/**
 * Criptografa um valor em string usando AES-256-GCM.
 * Retorna uma string no formato: iv:authTag:ciphertext (hex)
 */
export declare function encrypt(plaintext: string): string;
/**
 * Descriptografa um valor previamente criptografado por `encrypt()`.
 * Retorna null se o valor não estiver no formato esperado (ex: dados legados não criptografados).
 */
export declare function decrypt(ciphertext: string): string | null;
/**
 * Criptografa apenas se o valor não for null/undefined.
 */
export declare function encryptOptional(value: string | null | undefined): string | null;
/**
 * Descriptografa apenas se o valor não for null/undefined.
 */
export declare function decryptOptional(value: string | null | undefined): string | null;
//# sourceMappingURL=encryption.d.ts.map