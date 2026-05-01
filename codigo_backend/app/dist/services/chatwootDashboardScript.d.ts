/**
 * Atualiza o Dashboard Script diretamente no banco do Chatwoot
 */
export declare function updateChatwootDashboardScript(accountId: number, kanbancwUrl?: string, chatwootDatabaseUrl?: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Aplica o Dashboard Script automaticamente no startup.
 * O Dashboard Script é um registro GLOBAL na tabela installation_configs do Chatwoot
 * (campo DASHBOARD_SCRIPTS), aplicado a todos os usuários de todas as contas.
 * O accountId=1 é usado apenas como referência para buscar a URL nas configurações do sistema;
 * não limita a aplicação do script a uma conta específica.
 */
export declare function applyDashboardScriptOnStartup(): Promise<void>;
//# sourceMappingURL=chatwootDashboardScript.d.ts.map