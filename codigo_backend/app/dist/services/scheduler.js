"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("@prisma/client");
const chatwoot_1 = __importDefault(require("./chatwoot"));
const logger_1 = __importDefault(require("../utils/logger"));
const sequenceExecutor_1 = __importDefault(require("./sequenceExecutor"));
const encryption_1 = require("../utils/encryption");
const chatwootDatabase_1 = __importDefault(require("./chatwootDatabase"));
const prisma = new client_1.PrismaClient();
// Verifica e envia mensagens agendadas a cada minuto
function startScheduler() {
    logger_1.default.info('Starting scheduled message processor...');
    // Executa a cada minuto
    node_cron_1.default.schedule('* * * * *', async () => {
        await processScheduledMessages();
        await processSequenceSteps();
    });
    // Executa imediatamente ao iniciar
    processScheduledMessages();
    processSequenceSteps();
}
async function processScheduledMessages() {
    try {
        const now = new Date();
        // Busca mensagens pendentes que já passaram do horário agendado
        const pendingMessages = await prisma.scheduledMessage.findMany({
            where: {
                status: 'pending',
                scheduledAt: {
                    lte: now,
                },
            },
            take: 10, // Processa 10 por vez para não sobrecarregar
        });
        if (pendingMessages.length === 0) {
            return;
        }
        logger_1.default.info(`Processing ${pendingMessages.length} scheduled messages`);
        for (const msg of pendingMessages) {
            try {
                // Prepara autenticação: usa JWT se disponível, senão API token
                let jwt = undefined;
                let apiToken = undefined;
                if (msg.jwtAccessToken && msg.jwtClient && msg.jwtUid && msg.jwtExpiry && msg.jwtTokenType) {
                    // Reconstrói o objeto JWT descriptografando os dados salvos
                    jwt = {
                        'access-token': (0, encryption_1.decryptOptional)(msg.jwtAccessToken) ?? '',
                        'client': (0, encryption_1.decryptOptional)(msg.jwtClient) ?? '',
                        'uid': (0, encryption_1.decryptOptional)(msg.jwtUid) ?? '',
                        'expiry': (0, encryption_1.decryptOptional)(msg.jwtExpiry) ?? '',
                        'token-type': (0, encryption_1.decryptOptional)(msg.jwtTokenType) ?? 'Bearer'
                    };
                    logger_1.default.info(`Sending scheduled message ${msg.id} with JWT`, {
                        conversationId: msg.conversationId
                    });
                }
                else if (msg.apiToken) {
                    apiToken = (0, encryption_1.decryptOptional)(msg.apiToken) ?? msg.apiToken;
                    logger_1.default.info(`Sending scheduled message ${msg.id} with API token`, {
                        conversationId: msg.conversationId
                    });
                }
                else {
                    // Fallback: tenta recuperar o token do Chatwoot DB pelo userId que criou a mensagem
                    try {
                        const chatwootToken = await chatwootDatabase_1.default.getUserAccessToken(msg.createdBy);
                        if (chatwootToken) {
                            apiToken = chatwootToken;
                            // Persiste o token para evitar nova consulta ao DB nas próximas execuções
                            await prisma.scheduledMessage.update({
                                where: { id: msg.id },
                                data: { apiToken: (0, encryption_1.encryptOptional)(chatwootToken) },
                            });
                            logger_1.default.info(`Recovered Chatwoot token for scheduled message ${msg.id} via DB lookup`, { createdBy: msg.createdBy });
                        }
                        else {
                            await prisma.scheduledMessage.update({
                                where: { id: msg.id },
                                data: {
                                    status: 'failed',
                                    errorMessage: 'No authentication data available — configure o agendamento novamente',
                                },
                            });
                            logger_1.default.error(`Scheduled message ${msg.id} has no authentication data and token lookup failed`);
                            continue;
                        }
                    }
                    catch (lookupErr) {
                        await prisma.scheduledMessage.update({
                            where: { id: msg.id },
                            data: {
                                status: 'failed',
                                errorMessage: 'No authentication data available — configure o agendamento novamente',
                            },
                        });
                        logger_1.default.error(`Scheduled message ${msg.id}: token lookup failed`, { error: lookupErr });
                        continue;
                    }
                }
                // Extrai caminho do anexo se houver
                let attachmentPath = undefined;
                if (msg.attachments) {
                    try {
                        const attachments = JSON.parse(msg.attachments);
                        if (attachments.length > 0 && attachments[0].filePath) {
                            attachmentPath = attachments[0].filePath;
                            logger_1.default.info(`Found attachment for message ${msg.id}`, {
                                filePath: attachmentPath
                            });
                        }
                    }
                    catch (e) {
                        logger_1.default.warn(`Failed to parse attachments for message ${msg.id}`);
                    }
                }
                // Envia a mensagem via API do Chatwoot
                const success = await chatwoot_1.default.sendMessage(msg.accountId, msg.conversationId, msg.message, jwt, apiToken, attachmentPath);
                if (success) {
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'sent',
                            sentAt: new Date(),
                        },
                    });
                    logger_1.default.info(`Scheduled message ${msg.id} sent successfully`);
                }
                else {
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: {
                            status: 'failed',
                            errorMessage: 'Failed to send message via Chatwoot API',
                        },
                    });
                    logger_1.default.error(`Failed to send scheduled message ${msg.id}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await prisma.scheduledMessage.update({
                    where: { id: msg.id },
                    data: {
                        status: 'failed',
                        errorMessage,
                    },
                });
                logger_1.default.error(`Error processing scheduled message ${msg.id}`, { error: errorMessage });
            }
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error in scheduled message processor', { error: errorMessage });
    }
}
async function processSequenceSteps() {
    try {
        await sequenceExecutor_1.default.processScheduledSteps();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Error in sequence step processor', { error: errorMessage });
    }
}
exports.default = { startScheduler };
//# sourceMappingURL=scheduler.js.map