"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/calendar/scheduled
 * Busca mensagens agendadas para visualização em calendário
 * Query params:
 *   - startDate: ISO date string (início do período)
 *   - endDate: ISO date string (fim do período)
 */
router.get('/scheduled', async (req, res) => {
    try {
        const accountId = req.accountId;
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate are required'
            });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format'
            });
        }
        // Busca mensagens agendadas no período
        const scheduledMessages = await prisma.scheduledMessage.findMany({
            where: {
                accountId,
                scheduledAt: {
                    gte: start,
                    lte: end
                }
            },
            orderBy: {
                scheduledAt: 'asc'
            },
            select: {
                id: true,
                conversationId: true,
                message: true,
                scheduledAt: true,
                status: true,
                sentAt: true,
                errorMessage: true,
                createdBy: true,
                attachments: true,
                createdAt: true
            }
        });
        // Busca informações das conversas relacionadas
        const conversationIds = [...new Set(scheduledMessages.map(m => m.conversationId))];
        const cards = await prisma.card.findMany({
            where: {
                conversationId: {
                    in: conversationIds
                },
                accountId
            }
        });
        // Mapeia conversationId -> card
        const cardMap = new Map(cards.map(c => [c.conversationId, c]));
        // Enriquece mensagens com dados da conversa
        const enrichedMessages = scheduledMessages.map(msg => {
            const card = cardMap.get(msg.conversationId);
            let attachmentsParsed = null;
            if (msg.attachments) {
                try {
                    attachmentsParsed = JSON.parse(msg.attachments);
                }
                catch (e) {
                    logger_1.default.warn(`Failed to parse attachments for message ${msg.id}`);
                }
            }
            return {
                id: msg.id,
                conversationId: msg.conversationId,
                message: msg.message,
                scheduledAt: msg.scheduledAt,
                status: msg.status,
                sentAt: msg.sentAt,
                errorMessage: msg.errorMessage,
                createdBy: msg.createdBy,
                attachments: attachmentsParsed,
                createdAt: msg.createdAt,
                // Dados da conversa/card
                card: card ? {
                    id: card.id,
                    customName: card.customName
                } : null
            };
        });
        res.json({
            success: true,
            data: enrichedMessages
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching scheduled messages for calendar', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scheduled messages'
        });
    }
});
/**
 * GET /api/calendar/stats
 * Estatísticas de agendamentos (quantos por dia)
 * Query params:
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 */
router.get('/stats', async (req, res) => {
    try {
        const accountId = req.accountId;
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate are required'
            });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        const messages = await prisma.scheduledMessage.findMany({
            where: {
                accountId,
                scheduledAt: {
                    gte: start,
                    lte: end
                }
            },
            select: {
                scheduledAt: true,
                status: true
            }
        });
        // Agrupa por dia
        const statsByDay = messages.reduce((acc, msg) => {
            const dateKey = msg.scheduledAt.toISOString().split('T')[0];
            if (!acc[dateKey]) {
                acc[dateKey] = { total: 0, pending: 0, sent: 0, failed: 0, cancelled: 0 };
            }
            acc[dateKey].total++;
            acc[dateKey][msg.status]++;
            return acc;
        }, {});
        res.json({
            success: true,
            data: statsByDay
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching calendar stats', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stats'
        });
    }
});
exports.default = router;
//# sourceMappingURL=calendar.js.map