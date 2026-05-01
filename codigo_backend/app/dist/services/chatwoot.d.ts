import { ChatwootJWT, ChatwootUser, ChatwootConversation } from '../types';
declare class ChatwootAPI {
    private client;
    private baseURL;
    constructor();
    private setJWTHeaders;
    validateJWT(jwt: ChatwootJWT): Promise<ChatwootUser | null>;
    validateAPIToken(apiToken: string): Promise<ChatwootUser | null>;
    getUserAccessToken(jwt?: ChatwootJWT, apiToken?: string): Promise<string | null>;
    getConversations(accountId: number, jwt?: ChatwootJWT, apiToken?: string, params?: {
        status?: string;
        assignee_type?: string;
        inbox_id?: number;
        page?: number;
        fetchAll?: boolean;
    }): Promise<ChatwootConversation[]>;
    updateConversationStatus(accountId: number, conversationId: number, status: 'open' | 'resolved' | 'pending' | 'snoozed', jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    getAccountAgents(accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootAgent[]>;
    getAccountLabels(accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<any[]>;
    getAccountTeams(accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<any[]>;
    getConversation(accountId: number, conversationId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootConversation | null>;
    markConversationAsRead(accountId: number, conversationId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<void>;
    getConversationMessages(accountId: number, conversationId: number, jwt?: ChatwootJWT, apiToken?: string, params?: {
        before?: number;
    }): Promise<ChatwootMessage[]>;
    private downloadFile;
    sendWhatsAppTemplate(accountId: number, conversationId: number, templateName: string, language: string, processedParams: string[], apiToken?: string, jwt?: ChatwootJWT): Promise<boolean>;
    sendMessage(accountId: number, conversationId: number, message: string, jwt?: ChatwootJWT, apiToken?: string, attachmentPath?: string): Promise<boolean>;
    sendPrivateNote(accountId: number, conversationId: number, content: string, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    deleteConversation(accountId: number, conversationId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    getContact(accountId: number, contactId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<any | null>;
    getContactConversations(accountId: number, contactId: number, apiToken?: string, jwt?: ChatwootJWT): Promise<any[]>;
    getInboxes(accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootInbox[]>;
    getWhatsAppTemplates(accountId: number, inboxId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<any[]>;
    createInbox(accountId: number, data: {
        name: string;
        channel: {
            type: string;
            webhook_url?: string;
            phone_number?: string;
        };
    }, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootInbox>;
    deleteInbox(accountId: number, inboxId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    getContacts(accountId: number, page?: number, jwt?: ChatwootJWT, apiToken?: string): Promise<{
        payload: any[];
        meta: any;
    }>;
    searchContacts(accountId: number, query: string, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootContact[]>;
    createContact(accountId: number, data: {
        name?: string;
        email?: string;
        phone_number?: string;
        inbox_id: number;
    }, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootContact | null>;
    createConversation(accountId: number, data: {
        source_id: string;
        inbox_id: number;
        contact_id?: number;
        additional_attributes?: Record<string, unknown>;
        custom_attributes?: Record<string, unknown>;
        status?: 'open' | 'pending' | 'resolved';
    }, jwt?: ChatwootJWT, apiToken?: string): Promise<ChatwootConversation | null>;
    getUserProfile(jwt?: ChatwootJWT, apiToken?: string): Promise<any>;
    sendAttachment(conversationId: number, imageUrl: string, caption?: string, accountId?: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    addLabels(conversationId: number, labels: string[], accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    removeLabels(conversationId: number, labels: string[], accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    assign(conversationId: number, assignType: 'agent' | 'team', assignId: number, accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    assignAgent(conversationId: number, agentId: number, accountId: number, jwt?: ChatwootJWT, apiToken?: string): Promise<boolean>;
    private getAgentAccessToken;
    updateInboxWebhookUrl(accountId: number, inboxId: number, webhookUrl: string, jwt?: ChatwootJWT, apiToken?: string): Promise<void>;
    /**
     * Cria um webhook global no Chatwoot
     */
    createWebhook(accountId: number, url: string, subscriptions: string[], jwt?: ChatwootJWT, apiToken?: string): Promise<any>;
    /**
     * Remove um webhook global do Chatwoot
     */
    deleteWebhook(accountId: number, webhookId: string, jwt?: ChatwootJWT, apiToken?: string): Promise<void>;
    findLatestConversationByPhone(accountId: number, phone: string, jwt?: ChatwootJWT, apiToken?: string): Promise<number | null>;
}
export interface ChatwootAgent {
    id: number;
    name: string;
    email: string;
    role: string;
    availability_status: string;
    avatar_url?: string;
}
export interface ChatwootMessage {
    id: number;
    content: string;
    message_type: 'incoming' | 'outgoing' | 'activity' | 'template';
    content_type: string;
    private: boolean;
    sender?: {
        id: number;
        name: string;
        avatar_url?: string;
        type: 'contact' | 'user';
    };
    created_at: number;
    conversation_id: number;
    attachments?: Array<{
        id: number;
        file_type: string;
        data_url: string;
        thumb_url?: string;
        file_name?: string;
        extension?: string;
    }>;
}
export interface ChatwootInbox {
    id: number;
    name: string;
    channel_type: string;
    phone_number?: string;
    avatar_url?: string;
    webhook_url?: string;
    enable_auto_assignment?: boolean;
}
export interface ChatwootContact {
    id: number;
    name: string;
    email?: string;
    phone_number?: string;
    identifier?: string;
    thumbnail?: string;
    additional_attributes?: Record<string, unknown>;
    custom_attributes?: Record<string, unknown>;
    last_activity_at?: number;
}
declare const _default: ChatwootAPI;
export default _default;
//# sourceMappingURL=chatwoot.d.ts.map