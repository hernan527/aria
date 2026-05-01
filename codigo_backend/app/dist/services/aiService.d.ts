import { AIAgentNodeData } from '../types';
export interface AIResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare class AIService {
    /**
     * Chama a API da OpenAI
     */
    callOpenAI(apiKey: string, data: AIAgentNodeData, messages: AIMessage[]): Promise<AIResponse>;
    /**
     * Chama a API do Groq
     */
    callGroq(apiKey: string, data: AIAgentNodeData, messages: AIMessage[]): Promise<AIResponse>;
    /**
     * Chama a API do OpenRouter
     */
    callOpenRouter(apiKey: string, data: AIAgentNodeData, messages: AIMessage[]): Promise<AIResponse>;
    /**
     * Interpola variáveis em um texto
     * Exemplo: "Olá {{nome}}" com context.nome = "João" -> "Olá João"
     */
    interpolateVariables(text: string, context: Record<string, any>): string;
    /**
     * Método genérico que decide qual provedor usar
     */
    execute(provider: 'openai' | 'groq' | 'openrouter', apiKey: string, data: AIAgentNodeData, messages: AIMessage[]): Promise<AIResponse>;
}
declare const _default: AIService;
export default _default;
//# sourceMappingURL=aiService.d.ts.map