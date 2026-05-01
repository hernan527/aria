interface EvolutionInstanceResponse {
    instance: {
        instanceName: string;
        status: string;
    };
    qrcode?: {
        base64: string;
        code: string;
    };
}
interface EvolutionStatusResponse {
    instance: {
        instanceName: string;
        status: string;
    };
    qrcode?: {
        base64: string;
        code: string;
    };
}
declare class EvolutionAPI {
    /**
     * Cria um cliente Axios configurado com as credenciais da conta
     */
    private getClient;
    /**
     * Cria uma nova instância WhatsApp na Evolution API com integração Chatwoot
     */
    createInstance(accountId: number, instanceName: string, phoneNumber: string, inboxId: number, chatwootConfig?: {
        accountId: number;
        token: string;
        url: string;
        nameInbox: string;
    }): Promise<EvolutionInstanceResponse>;
    /**
     * Verifica o status de uma instância (somente leitura — não gera QR)
     */
    getStatus(accountId: number, instanceName: string): Promise<EvolutionStatusResponse>;
    /**
     * Conecta a instância e retorna o QR code.
     * Chamar APENAS em: criação, reconexão após desconexão, ou botão "Gerar novo QR".
     */
    connectAndGetQR(accountId: number, instanceName: string): Promise<EvolutionStatusResponse>;
    /**
     * Deleta uma instância
     */
    deleteInstance(accountId: number, instanceName: string): Promise<boolean>;
    /**
     * Desconecta (logout) de uma instância
     */
    logoutInstance(accountId: number, instanceName: string): Promise<boolean>;
    /**
     * Lista todas as instâncias
     */
    fetchInstances(accountId: number): Promise<any[]>;
    /**
     * Busca informações detalhadas da instância (número conectado, perfil, etc)
     */
    getInstanceInfo(accountId: number, instanceName: string): Promise<any>;
    /**
     * Atualiza configurações do Chatwoot (agent name)
     */
    updateChatwootSettings(accountId: number, instanceName: string, config: {
        nameInbox?: string;
        signMsg?: boolean;
        number?: string;
        url?: string;
        accountId?: string;
        token?: string;
        signDelimiter?: string;
        rejectCalls?: boolean;
        msgCall?: string;
    }): Promise<any>;
    /**
     * Atualiza configurações da instância (grupos, chamadas, etc)
     */
    updateInstanceSettings(accountId: number, instanceName: string, config: {
        rejectCall?: boolean;
        msgCall?: string;
        groupsIgnore?: boolean;
        alwaysOnline?: boolean;
        readMessages?: boolean;
        readStatus?: boolean;
        syncFullHistory?: boolean;
    }): Promise<any>;
    /**
     * Busca configurações atuais do Chatwoot
     */
    getChatwootSettings(accountId: number, instanceName: string): Promise<any>;
    /**
     * Busca configurações atuais da instância
     */
    getInstanceSettings(accountId: number, instanceName: string): Promise<any>;
}
declare const evolutionAPI: EvolutionAPI;
export declare const createEvolutionInstance: (accountId: number, instanceName: string, phoneNumber: string, inboxId: number, chatwootConfig?: {
    accountId: number;
    token: string;
    url: string;
    nameInbox: string;
}) => Promise<EvolutionInstanceResponse>;
export declare const getInstanceStatus: (accountId: number, instanceName: string) => Promise<EvolutionStatusResponse>;
export declare const deleteEvolutionInstance: (accountId: number, instanceName: string) => Promise<boolean>;
export declare const logoutEvolutionInstance: (accountId: number, instanceName: string) => Promise<boolean>;
export declare const fetchEvolutionInstances: (accountId: number) => Promise<any[]>;
export declare const getEvolutionInstanceInfo: (accountId: number, instanceName: string) => Promise<any>;
export declare const updateEvolutionChatwootSettings: (accountId: number, instanceName: string, config: any) => Promise<any>;
export declare const updateEvolutionInstanceSettings: (accountId: number, instanceName: string, config: any) => Promise<any>;
export declare const getEvolutionChatwootSettings: (accountId: number, instanceName: string) => Promise<any>;
export declare const getEvolutionInstanceSettings: (accountId: number, instanceName: string) => Promise<any>;
export declare const connectEvolutionAndGetQR: (accountId: number, instanceName: string) => Promise<EvolutionStatusResponse>;
export default evolutionAPI;
//# sourceMappingURL=evolution.d.ts.map