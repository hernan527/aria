declare const router: import("express-serve-static-core").Router;
export declare function initWebPush(): void;
/**
 * Envia push notification para todos os subscribers de um agente.
 * Chamado pelo webhook handler quando chega message_created.
 */
export declare function sendPushToAccount(accountId: number, assigneeId: number | null, payload: {
    title: string;
    body: string;
    url: string;
}): Promise<void>;
export default router;
//# sourceMappingURL=cwapp-push.d.ts.map