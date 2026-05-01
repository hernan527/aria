import { Request } from 'express';
export interface ChatwootJWT {
    'access-token': string;
    'token-type': string;
    client: string;
    expiry: string;
    uid: string;
}
export interface ChatwootUser {
    id: number;
    account_id: number;
    email: string;
    name: string;
    role: string | number;
    access_token?: string;
    type?: string;
    accounts?: {
        account_id: number;
        role: string;
    }[];
}
export interface ChatwootContact {
    id: number;
    name: string;
    email?: string;
    phone_number?: string;
    avatar_url?: string;
}
export interface ChatwootAssignee {
    id: number;
    name: string;
    email: string;
    avatar_url?: string;
}
export interface ChatwootInbox {
    id: number;
    name: string;
    channel_type: string;
}
export interface ChatwootConversation {
    id: number;
    account_id: number;
    inbox_id: number;
    status: 'open' | 'resolved' | 'pending' | 'snoozed';
    priority: 'urgent' | 'high' | 'medium' | 'low' | null;
    unread_count: number;
    messages_count: number;
    created_at: string;
    updated_at: string;
    contact_last_seen_at: string | null;
    agent_last_seen_at: string | null;
    meta: {
        sender: ChatwootContact;
        assignee: ChatwootAssignee | null;
    };
    inbox: ChatwootInbox;
    labels: string[];
}
export interface TransferredFrom {
    funnelId: number;
    funnelName: string;
    stageId: number;
    stageName: string;
    transferredAt: string;
}
export interface KanbanCard {
    id: number;
    status: string;
    priority: string | null;
    unread_count: number;
    created_at: string;
    updated_at: string;
    contact: ChatwootContact | null;
    meta: {
        assignee: ChatwootAssignee | null;
    };
    inbox: ChatwootInbox | null;
    labels: string[];
    customName?: string | null;
    leadStatus?: 'open' | 'won' | 'lost';
    transferredFrom?: TransferredFrom | null;
    projects?: any[];
    items?: any[];
    totalValue?: number;
    chatwootUrl?: string | null;
    isStandalone?: boolean;
    cardId?: number;
}
export interface KanbanColumn {
    id: string;
    name: string;
    color?: string;
    chatwootStatus?: string | null;
    cards: KanbanCard[];
    totalCards?: number;
    hasMore?: boolean;
}
export interface KanbanBoard {
    columns: KanbanColumn[];
}
export interface AuthenticatedRequest extends Request {
    user: ChatwootUser;
    jwt: ChatwootJWT;
    apiToken?: string;
}
export interface WebhookPayload {
    event: string;
    account: {
        id: number;
        name: string;
    };
    conversation?: ChatwootConversation;
    message?: {
        id: number;
        content: string;
        message_type: string;
        conversation_id: number;
        sender?: ChatwootContact;
        private?: boolean;
    };
}
export type FlowNodeType = 'start' | 'sendText' | 'sendImage' | 'sendVideo' | 'sendFile' | 'condition' | 'switch' | 'delay' | 'sequenceDelay' | 'checkResponse' | 'changeStatus' | 'labels' | 'assign' | 'aiAgent' | 'knowledgeBase' | 'httpRequest' | 'waitForResponse' | 'input' | 'end' | 'sequenceEnd' | 'sendWATemplate';
export interface FlowNode {
    id: string;
    type: FlowNodeType;
    position: {
        x: number;
        y: number;
    };
    data: Record<string, any>;
}
export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}
export interface FlowData {
    nodes: FlowNode[];
    edges: FlowEdge[];
}
export interface FlowTrigger {
    type: 'keyword' | 'inbox' | 'label';
    value: string | number;
}
export interface CreateFlowDTO {
    name: string;
    description?: string;
    trigger: FlowTrigger;
    flowData?: FlowData;
}
export interface UpdateFlowDTO {
    name?: string;
    description?: string;
    trigger?: FlowTrigger;
    flowData?: FlowData;
    isActive?: boolean;
}
export interface FlowExecutionContext {
    message?: string;
    senderName?: string;
    contactEmail?: string;
    inboxId?: number;
    response?: string;
    [key: string]: any;
}
export interface FlowJobData {
    flowId: number;
    conversationId: number;
    accountId: number;
    initialContext: FlowExecutionContext;
}
export interface SendTextNodeData {
    message: string;
}
export interface SendImageNodeData {
    imageUrl: string;
    caption?: string;
}
export interface ConditionNodeData {
    condition: string;
}
export interface DelayNodeData {
    seconds: number;
}
export interface ChangeStatusNodeData {
    status: 'open' | 'pending' | 'resolved';
}
export interface AddLabelNodeData {
    labels: string[];
}
export interface AssignAgentNodeData {
    agentId: number;
}
export interface WaitForResponseNodeData {
    timeout?: number;
}
export interface AIAgentNodeData {
    provider: 'openai' | 'groq';
    model: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    saveResponseTo?: string;
    sendToChat?: boolean;
}
//# sourceMappingURL=index.d.ts.map