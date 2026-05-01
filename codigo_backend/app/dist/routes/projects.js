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
 * GET /api/projects
 * Lista todos os projetos da conta
 * Query params:
 *   - status: active, completed, cancelled (opcional)
 */
router.get('/', async (req, res) => {
    try {
        const accountId = req.accountId;
        const { status } = req.query;
        const where = { accountId };
        if (status && typeof status === 'string') {
            where.status = status;
        }
        const projects = await prisma.project.findMany({
            where,
            include: {
                conversations: {
                    select: {
                        id: true,
                        conversationId: true,
                        cardId: true,
                        addedAt: true
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        // Adiciona contagem de conversas
        const projectsWithCount = projects.map(p => ({
            ...p,
            conversationCount: p.conversations.length
        }));
        res.json({
            success: true,
            data: projectsWithCount
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching projects', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects'
        });
    }
});
/**
 * GET /api/projects/stats
 * Retorna estatísticas gerais dos projetos da conta
 */
router.get('/stats', async (req, res) => {
    try {
        const accountId = req.accountId;
        // Contagem total de projetos
        const totalProjects = await prisma.project.count({
            where: { accountId }
        });
        // Projetos por status
        const projectsByStatus = await prisma.project.groupBy({
            by: ['status'],
            where: { accountId },
            _count: true
        });
        const statusCounts = {
            active: 0,
            completed: 0,
            onHold: 0
        };
        projectsByStatus.forEach(item => {
            if (item.status === 'active')
                statusCounts.active = item._count;
            else if (item.status === 'completed')
                statusCounts.completed = item._count;
            else if (item.status === 'on-hold')
                statusCounts.onHold = item._count;
        });
        // Buscar todos os projetos com suas tasks
        const projects = await prisma.project.findMany({
            where: { accountId },
            include: {
                tasks: {
                    select: {
                        status: true
                    }
                },
                members: {
                    select: {
                        id: true
                    }
                }
            }
        });
        // Calcular estatísticas de tasks
        let totalTasks = 0;
        let completedTasks = 0;
        let tasksByStatus = {
            todo: 0,
            inProgress: 0,
            done: 0
        };
        projects.forEach(project => {
            project.tasks.forEach(task => {
                totalTasks++;
                if (task.status === 'done') {
                    completedTasks++;
                    tasksByStatus.done++;
                }
                else if (task.status === 'in-progress') {
                    tasksByStatus.inProgress++;
                }
                else {
                    tasksByStatus.todo++;
                }
            });
        });
        // Contar membros únicos
        const allMemberIds = new Set();
        projects.forEach(project => {
            project.members.forEach(member => {
                allMemberIds.add(member.id);
            });
        });
        // Projetos recentes com estatísticas
        const recentProjects = await prisma.project.findMany({
            where: { accountId },
            include: {
                tasks: {
                    select: {
                        status: true
                    }
                },
                members: {
                    select: {
                        id: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });
        const recentProjectsWithStats = recentProjects.map(project => ({
            id: project.id,
            name: project.name,
            status: project.status,
            tasksCount: project.tasks.length,
            completedTasksCount: project.tasks.filter(t => t.status === 'done').length,
            membersCount: project.members.length,
            createdAt: project.createdAt
        }));
        res.json({
            totalProjects,
            activeProjects: statusCounts.active,
            completedProjects: statusCounts.completed,
            totalTasks,
            completedTasks,
            totalMembers: allMemberIds.size,
            projectsByStatus: statusCounts,
            tasksByStatus,
            recentProjects: recentProjectsWithStats
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project stats', { error, accountId: req.accountId });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project statistics'
        });
    }
});
/**
 * GET /api/projects/:id
 * Busca um projeto específico com todas as conversas vinculadas
 */
router.get('/:id', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            },
            include: {
                conversations: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                color: true
                            }
                        }
                    },
                    orderBy: {
                        addedAt: 'desc'
                    }
                }
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Busca os cards relacionados para pegar informações adicionais
        const conversationIds = project.conversations.map(c => c.conversationId);
        const cards = await prisma.card.findMany({
            where: {
                conversationId: {
                    in: conversationIds
                },
                accountId
            }
        });
        // Busca total de itens de todas as conversas do projeto
        const totalItems = await prisma.cardItem.aggregate({
            where: {
                conversationId: {
                    in: conversationIds
                },
                accountId
            },
            _sum: {
                value: true
            },
            _count: {
                id: true
            }
        });
        res.json({
            success: true,
            data: {
                ...project,
                cards,
                totalValue: totalItems._sum.value || 0,
                totalItemsCount: totalItems._count.id || 0
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project', { error, projectId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project'
        });
    }
});
/**
 * GET /api/projects/:id/details
 * Busca projeto com TODAS as relações (tasks, milestones, members, files, discussions, activities)
 */
router.get('/:id/details', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            },
            include: {
                conversations: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                color: true
                            }
                        }
                    },
                    orderBy: {
                        addedAt: 'desc'
                    }
                },
                tasks: {
                    include: {
                        milestone: {
                            select: {
                                id: true,
                                name: true,
                                dueDate: true
                            }
                        }
                    },
                    orderBy: [
                        { order: 'asc' },
                        { createdAt: 'desc' }
                    ]
                },
                milestones: {
                    include: {
                        tasks: {
                            select: {
                                id: true,
                                status: true
                            }
                        }
                    },
                    orderBy: [
                        { order: 'asc' },
                        { createdAt: 'asc' }
                    ]
                },
                members: {
                    orderBy: {
                        addedAt: 'asc'
                    }
                },
                files: {
                    orderBy: {
                        uploadedAt: 'desc'
                    }
                },
                discussions: {
                    include: {
                        comments: {
                            orderBy: {
                                createdAt: 'asc'
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                activities: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 50 // Últimas 50 atividades
                }
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        logger_1.default.info('Project details fetched', {
            projectId,
            tasksCount: project.tasks?.length || 0,
            milestonesCount: project.milestones?.length || 0,
            membersCount: project.members?.length || 0,
            filesCount: project.files?.length || 0,
            discussionsCount: project.discussions?.length || 0,
            activitiesCount: project.activities?.length || 0
        });
        // Log detalhado das tasks para debug
        if (project.tasks && project.tasks.length > 0) {
            logger_1.default.info('Tasks details', {
                projectId,
                tasks: project.tasks.map(t => ({ id: t.id, title: t.title, status: t.status }))
            });
        }
        res.json({
            success: true,
            data: project
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project details', { error, projectId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project details'
        });
    }
});
/**
 * GET /api/projects/:id/stats
 * Busca estatísticas do projeto
 */
router.get('/:id/stats', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Estatísticas de tarefas
        const tasks = await prisma.projectTask.findMany({
            where: { projectId },
            select: {
                status: true,
                dueDate: true
            }
        });
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
        const pendingTasks = tasks.filter(t => t.status === 'pending').length;
        const now = new Date();
        const overdueTasks = tasks.filter(t => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now).length;
        // Estatísticas de milestones
        const milestones = await prisma.projectMilestone.findMany({
            where: { projectId },
            include: {
                tasks: {
                    select: {
                        status: true
                    }
                }
            }
        });
        const totalMilestones = milestones.length;
        const completedMilestones = milestones.filter(m => {
            const totalTasksInMilestone = m.tasks.length;
            if (totalTasksInMilestone === 0)
                return false;
            const completedTasksInMilestone = m.tasks.filter(t => t.status === 'completed').length;
            return completedTasksInMilestone === totalTasksInMilestone;
        }).length;
        // Contagem de membros
        const totalMembers = await prisma.projectMember.count({
            where: { projectId }
        });
        // Contagem de arquivos
        const totalFiles = await prisma.projectFile.count({
            where: { projectId }
        });
        // Contagem de discussões
        const totalDiscussions = await prisma.projectDiscussion.count({
            where: { projectId }
        });
        // Contagem de conversas
        const conversationCount = await prisma.projectConversation.count({
            where: { projectId }
        });
        // Total de valor dos itens das conversas
        const conversationIds = await prisma.projectConversation.findMany({
            where: { projectId },
            select: { conversationId: true }
        });
        const totalItems = await prisma.cardItem.aggregate({
            where: {
                conversationId: {
                    in: conversationIds.map(c => c.conversationId)
                },
                accountId
            },
            _sum: {
                value: true
            }
        });
        // Progresso geral do projeto (baseado em tarefas)
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const stats = {
            totalTasks,
            completedTasks,
            pendingTasks,
            inProgressTasks,
            overdueTasks,
            totalMilestones,
            completedMilestones,
            totalMembers,
            totalFiles,
            totalDiscussions,
            progress,
            conversationCount,
            totalValue: totalItems._sum.value || 0
        };
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project stats', { error, projectId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch project stats'
        });
    }
});
/**
 * POST /api/projects
 * Cria um novo projeto
 */
router.post('/', async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const { name, description, status, deadline, color } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }
        const project = await prisma.project.create({
            data: {
                accountId,
                name: name.trim(),
                description: description?.trim() || null,
                status: status || 'active',
                deadline: deadline ? new Date(deadline) : null,
                color: color || null,
                createdBy: userId
            }
        });
        logger_1.default.info('Project created', { projectId: project.id, name: project.name, accountId });
        res.json({
            success: true,
            data: project
        });
    }
    catch (error) {
        logger_1.default.error('Error creating project', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to create project'
        });
    }
});
/**
 * PUT /api/projects/:id
 * Atualiza um projeto
 */
router.put('/:id', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        const { name, description, status, deadline, color } = req.body;
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const existing = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            }
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        if (status !== undefined)
            updateData.status = status;
        if (deadline !== undefined)
            updateData.deadline = deadline ? new Date(deadline) : null;
        if (color !== undefined)
            updateData.color = color;
        const project = await prisma.project.update({
            where: { id: projectId },
            data: updateData
        });
        logger_1.default.info('Project updated', { projectId, accountId });
        res.json({
            success: true,
            data: project
        });
    }
    catch (error) {
        logger_1.default.error('Error updating project', { error, projectId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to update project'
        });
    }
});
/**
 * DELETE /api/projects/:id
 * Deleta um projeto (e automaticamente remove todas as vinculações)
 */
router.delete('/:id', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const existing = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            }
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        await prisma.project.delete({
            where: { id: projectId }
        });
        logger_1.default.info('Project deleted', { projectId, accountId });
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting project', { error, projectId: req.params.id });
        res.status(500).json({
            success: false,
            error: 'Failed to delete project'
        });
    }
});
/**
 * POST /api/projects/:id/conversations/:conversationId
 * Vincula uma conversa a um projeto
 */
router.post('/:id/conversations/:conversationId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.id);
        const conversationId = parseInt(req.params.conversationId);
        if (isNaN(projectId) || isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or conversation ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Busca o card da conversa (se existir)
        const card = await prisma.card.findFirst({
            where: {
                conversationId,
                accountId
            }
        });
        // Nota: Não é obrigatório ter um card no Kanban para vincular ao projeto
        // Verifica se já não está vinculada
        const existing = await prisma.projectConversation.findUnique({
            where: {
                projectId_conversationId: {
                    projectId,
                    conversationId
                }
            }
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Conversation already linked to this project'
            });
        }
        // Cria a vinculação
        const link = await prisma.projectConversation.create({
            data: {
                projectId,
                conversationId,
                cardId: card?.id ?? null,
                addedBy: userId
            }
        });
        logger_1.default.info('Conversation linked to project', { projectId, conversationId, accountId });
        res.json({
            success: true,
            data: link
        });
    }
    catch (error) {
        logger_1.default.error('Error linking conversation to project', { error, projectId: req.params.id, conversationId: req.params.conversationId });
        res.status(500).json({
            success: false,
            error: 'Failed to link conversation'
        });
    }
});
/**
 * DELETE /api/projects/:id/conversations/:conversationId
 * Remove vinculação de uma conversa do projeto
 */
router.delete('/:id/conversations/:conversationId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.id);
        const conversationId = parseInt(req.params.conversationId);
        if (isNaN(projectId) || isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or conversation ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                accountId
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Remove a vinculação
        await prisma.projectConversation.deleteMany({
            where: {
                projectId,
                conversationId
            }
        });
        logger_1.default.info('Conversation unlinked from project', { projectId, conversationId, accountId });
        res.json({
            success: true,
            message: 'Conversation unlinked successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error unlinking conversation from project', { error, projectId: req.params.id, conversationId: req.params.conversationId });
        res.status(500).json({
            success: false,
            error: 'Failed to unlink conversation'
        });
    }
});
/**
 * GET /api/projects/by-conversation/:conversationId
 * Busca projetos vinculados a uma conversa específica
 */
router.get('/by-conversation/:conversationId', async (req, res) => {
    try {
        const accountId = req.accountId;
        const conversationId = parseInt(req.params.conversationId);
        if (isNaN(conversationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID'
            });
        }
        const projectLinks = await prisma.projectConversation.findMany({
            where: {
                conversationId,
                project: {
                    accountId
                }
            },
            include: {
                project: true
            }
        });
        const projects = projectLinks.map(link => link.project);
        res.json({
            success: true,
            data: projects
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching projects by conversation', { error, conversationId: req.params.conversationId });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projects.js.map