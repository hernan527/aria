"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Helper para registrar atividades do projeto
 */
async function logActivity(projectId, userId, action, description, metadata) {
    try {
        await prisma.projectActivity.create({
            data: {
                projectId,
                userId,
                action,
                description,
                metadata: metadata || null,
            },
        });
    }
    catch (error) {
        console.error('Erro ao registrar atividade do projeto:', error);
        // Não lançar erro para não quebrar o fluxo principal
    }
}
/**
 * Exemplos de uso:
 *
 * logActivity(projectId, userId, 'task_created', 'Criou a tarefa "Revisar código"', { taskId: 123 });
 * logActivity(projectId, userId, 'milestone_completed', 'Completou o marco "MVP v1"', { milestoneId: 5 });
 * logActivity(projectId, userId, 'member_added', 'Adicionou João Silva à equipe', { memberId: 10, memberName: 'João Silva' });
 * logActivity(projectId, userId, 'file_uploaded', 'Enviou o arquivo "proposta.pdf"', { fileId: 7, fileName: 'proposta.pdf' });
 * logActivity(projectId, userId, 'discussion_created', 'Criou a discussão "Reunião de kickoff"', { discussionId: 3 });
 * logActivity(projectId, userId, 'conversation_linked', 'Vinculou a conversa #12345 ao projeto', { conversationId: 12345 });
 */
//# sourceMappingURL=projectActivity.js.map