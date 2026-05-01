export interface SystemSettingsData {
    chatwootDatabaseUrl?: string;
    chatwootPlatformToken?: string;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    wahaApiUrl?: string;
    wahaApiKey?: string;
    uazapiBaseUrl?: string;
    uazapiAdminToken?: string;
    customEncryptionKey?: string;
}
/**
 * Criptografa um valor usando AES-256-CBC
 */
export declare const encrypt: (text: string) => string;
/**
 * Descriptografa um valor usando AES-256-CBC
 */
export declare const decrypt: (text: string) => string;
/**
 * Busca as configurações de sistema para uma conta
 * Faz fallback para variáveis de ambiente se não encontrar no banco
 */
export declare const getSystemSettings: (accountId: number) => Promise<SystemSettingsData>;
/**
 * Salva ou atualiza as configurações de sistema para uma conta
 */
export declare const saveSystemSettings: (accountId: number, settings: Partial<SystemSettingsData>) => Promise<void>;
/**
 * Limpa o cache de configurações para uma conta
 */
export declare const clearSettingsCache: (accountId: number) => void;
/**
 * Migração de startup: copia as URLs de provider da conta 1 (SuperAdmin) para o
 * registro global (accountId=0) se este ainda não existir.
 * Isso garante que instalações existentes (0.0.6) continuem funcionando sem
 * exigir que o SuperAdmin re-salve em Config Extra.
 */
export declare const migrateGlobalProviderSettings: () => Promise<void>;
//# sourceMappingURL=systemSettings.d.ts.map