/**
 * Helper para registrar atividades do projeto
 */
export declare function logActivity(projectId: number, userId: number, action: string, description: string, metadata?: any): Promise<void>;
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
//# sourceMappingURL=projectActivity.d.ts.map