/**
 * Cria uma nova sessão (instância) na Waha
 * Se a sessão já existe, retorna a sessão existente
 */
export declare function createWahaSession(accountId: number, instanceName: string): Promise<any>;
/**
 * Cria integração Chatwoot na Waha
 * Se o app já existe, retorna o app existente
 */
export declare function createWahaChatwootApp(sessionName: string, chatwootUrl: string, accountId: number, inboxId: number, accountToken: string, inboxIdentifier: string): Promise<any>;
/**
 * Busca o ID do app Chatwoot criado
 */
export declare function getWahaAppId(accountId: number, sessionName: string): Promise<string>;
/**
 * Lista todas as sessões Waha
 */
export declare function fetchWahaSessions(accountId: number): Promise<any[]>;
/**
 * Obtém o status e QR code de uma sessão Waha
 */
export declare function getWahaSessionStatus(accountId: number, sessionName: string): Promise<any>;
/**
 * Deleta uma sessão Waha
 */
export declare function deleteWahaSession(sessionName: string): Promise<boolean>;
/**
 * Desconecta (logout) uma sessão Waha
 */
export declare function logoutWahaSession(sessionName: string): Promise<boolean>;
/**
 * Reinicia uma sessão Waha (para gerar novo QR code)
 */
export declare function restartWahaSession(sessionName: string): Promise<boolean>;
/**
 * Atualiza configurações do app Chatwoot na Waha
 */
export declare function updateWahaSessionConfig(sessionName: string, accountId: number, config: {
    agentName?: boolean;
    ignoreGroups?: boolean;
    ignoreChannels?: boolean;
    ignoreBroadcast?: boolean;
    rejectCalls?: boolean;
    callMessage?: string;
}): Promise<any>;
/**
 * Cria app "calls" para rejeitar ligações na Waha
 */
export declare function createWahaCallsApp(sessionName: string, accountId: number, rejectCalls: boolean, callMessage: string): Promise<any>;
/**
 * Atualiza app "calls" existente na Waha
 */
export declare function updateWahaCallsApp(appId: string, sessionName: string, accountId: number, rejectCalls: boolean, callMessage: string): Promise<any>;
/**
 * Busca configurações atuais do app Chatwoot na Waha
 */
export declare function getWahaSessionConfig(sessionName: string, accountId: number): Promise<any>;
//# sourceMappingURL=waha.d.ts.map