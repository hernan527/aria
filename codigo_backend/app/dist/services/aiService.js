"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const axios_1 = __importDefault(require("axios"));
class AIService {
    /**
     * Chama a API da OpenAI
     */
    async callOpenAI(apiKey, data, messages) {
        try {
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: data.model || 'gpt-4o-mini',
                messages: messages,
                temperature: data.temperature ?? 0.7,
                max_tokens: data.maxTokens ?? 1000,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 60000, // 60 segundos
            });
            const completion = response.data.choices[0].message.content;
            const usage = response.data.usage;
            return {
                content: completion,
                model: response.data.model,
                usage: usage
                    ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens,
                    }
                    : undefined,
            };
        }
        catch (error) {
            console.error('[AI-SERVICE] Erro ao chamar OpenAI:', error.response?.data || error.message);
            throw new Error(`Erro ao chamar OpenAI: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    /**
     * Chama a API do Groq
     */
    async callGroq(apiKey, data, messages) {
        try {
            const response = await axios_1.default.post('https://api.groq.com/openai/v1/chat/completions', {
                model: data.model || 'llama-3.3-70b-versatile',
                messages: messages,
                temperature: data.temperature ?? 0.7,
                max_tokens: data.maxTokens ?? 1000,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 60000, // 60 segundos
            });
            const completion = response.data.choices[0].message.content;
            const usage = response.data.usage;
            return {
                content: completion,
                model: response.data.model,
                usage: usage
                    ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens,
                    }
                    : undefined,
            };
        }
        catch (error) {
            console.error('[AI-SERVICE] Erro ao chamar Groq:', error.response?.data || error.message);
            throw new Error(`Erro ao chamar Groq: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    /**
     * Chama a API do OpenRouter
     */
    async callOpenRouter(apiKey, data, messages) {
        try {
            const response = await axios_1.default.post('https://openrouter.ai/api/v1/chat/completions', {
                model: data.model || 'openai/gpt-4o-mini',
                messages: messages,
                temperature: data.temperature ?? 0.7,
                max_tokens: data.maxTokens ?? 1000,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': process.env.VITE_API_URL || 'https://kanbancw.trecofantastico.com.br',
                    'X-Title': 'KanbanCW Chatbot',
                },
                timeout: 60000, // 60 segundos
            });
            const completion = response.data.choices[0].message.content;
            const usage = response.data.usage;
            return {
                content: completion,
                model: response.data.model,
                usage: usage
                    ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens,
                    }
                    : undefined,
            };
        }
        catch (error) {
            console.error('[AI-SERVICE] Erro ao chamar OpenRouter:', error.response?.data || error.message);
            throw new Error(`Erro ao chamar OpenRouter: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    /**
     * Interpola variáveis em um texto
     * Exemplo: "Olá {{nome}}" com context.nome = "João" -> "Olá João"
     */
    interpolateVariables(text, context) {
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            return context[varName]?.toString() || match;
        });
    }
    /**
     * Remove code fences e extrai o primeiro objeto JSON válido da resposta.
     */
    extractJsonPayload(content) {
        const cleaned = content
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error('Resposta da IA não contém JSON válido');
        }
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    /**
     * Calcula score comercial de um lead/card com saída estruturada.
     */
    async calculateLeadScore(cardData, options = {}) {
        const provider = options.provider || cardData.provider || 'openai';
        const apiKey = options.apiKey || cardData.apiKey;
        if (!apiKey) {
            throw new Error('API key não configurada para cálculo de lead score');
        }
        const defaultModelByProvider = {
            openai: 'gpt-4o-mini',
            groq: 'llama-3.3-70b-versatile',
            openrouter: 'openai/gpt-4o-mini',
        };
        const scoringContext = JSON.stringify(cardData, null, 2);
        const messages = [
            {
                role: 'system',
                content: 'Você é um especialista sênior em vendas consultivas de Seguros de Saúde e Seguros de Vida. Avalie a chance comercial de conversão de um lead e responda SOMENTE em JSON válido. Regras: score inteiro de 1 a 100; 1 = lead frio/baixo potencial; 100 = lead muito quente/alta chance de fechamento. Considere sinais típicos deste mercado: interesse explícito em cotação, faixa etária e composição familiar quando houver, profissão/risco, necessidade de cobertura, urgência por carência, portabilidade, objeções de preço, poder aquisitivo presumido, qualidade e completude dos dados cadastrais, histórico de respostas, estágio atual do funil, valor potencial da proposta e probabilidade de elegibilidade/aceitação. Penalize leads sem contexto, sem retorno ou com forte objeção financeira. Retorne exatamente no formato {"score": 1, "analysis": "texto curto e objetivo em português brasileiro"} sem markdown.'
            },
            {
                role: 'user',
                content: `Calcule o lead score deste card e produza uma análise executiva curta para o time comercial.\n\nCARD_DATA:\n${scoringContext}`
            }
        ];
        const response = await this.execute(provider, apiKey, {
            model: options.model || cardData.model || defaultModelByProvider[provider] || 'gpt-4o-mini',
            temperature: 0.2,
            maxTokens: 500,
        }, messages);
        const parsed = this.extractJsonPayload(response.content || '');
        const rawScore = Number(parsed?.score);
        const normalizedScore = Number.isFinite(rawScore)
            ? Math.max(1, Math.min(100, Math.round(rawScore)))
            : null;
        if (normalizedScore === null) {
            throw new Error('A IA não retornou um score numérico válido');
        }
        const analysis = typeof parsed?.analysis === 'string'
            ? parsed.analysis.trim().slice(0, 4000)
            : 'Análise não informada pela IA.';
        return {
            score: normalizedScore,
            analysis,
            provider,
            model: response.model,
            usage: response.usage,
            rawContent: response.content,
        };
    }
    /**
     * Método genérico que decide qual provedor usar
     */
    async execute(provider, apiKey, data, messages) {
        if (provider === 'openai') {
            return this.callOpenAI(apiKey, data, messages);
        }
        else if (provider === 'groq') {
            return this.callGroq(apiKey, data, messages);
        }
        else if (provider === 'openrouter') {
            return this.callOpenRouter(apiKey, data, messages);
        }
        else {
            throw new Error(`Provider não suportado: ${provider}`);
        }
    }
}
exports.AIService = AIService;
exports.default = new AIService();
//# sourceMappingURL=aiService.js.map
