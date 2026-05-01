"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const projectActivity_1 = require("../utils/projectActivity");
const checkResourcePermission_1 = require("../middleware/checkResourcePermission");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/projects/:projectId/milestones
 * Lista todos os milestones do projeto com contagem de tarefas
 */
router.get('/projects/:projectId/milestones', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: { id: projectId, accountId }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        const milestones = await prisma.projectMilestone.findMany({
            where: { projectId },
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
        });
        // Calcula estatísticas de cada milestone
        const milestonesWithStats = milestones.map(m => {
            const totalTasks = m.tasks.length;
            const completedTasks = m.tasks.filter(t => t.status === 'completed').length;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            return {
                ...m,
                taskCount: totalTasks,
                completedTaskCount: completedTasks,
                progress
            };
        });
        res.json({
            success: true,
            data: milestonesWithStats
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project milestones', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch milestones'
        });
    }
});
/**
 * POST /api/projects/:projectId/milestones
 * Cria um novo milestone
 */
router.post('/projects/:projectId/milestones', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const { name, description, dueDate, order } = req.body;
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Name is required'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: { id: projectId, accountId }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        const milestone = await prisma.projectMilestone.create({
            data: {
                projectId,
                name: name.trim(),
                description: description?.trim() || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                order: order !== undefined ? order : 0
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'milestone_created', `Criou o marco "${milestone.name}"`, { milestoneId: milestone.id, milestoneName: milestone.name });
        res.json({
            success: true,
            data: milestone
        });
    }
    catch (error) {
        logger_1.default.error('Error creating project milestone', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to create milestone'
        });
    }
});
/**
 * PUT /api/projects/:projectId/milestones/:id
 * Atualiza um milestone
 */
router.put('/projects/:projectId/milestones/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const milestoneId = parseInt(req.params.id);
        const { name, description, dueDate, order } = req.body;
        if (isNaN(projectId) || isNaN(milestoneId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or milestone ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: { id: projectId, accountId }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Verifica se o milestone existe e pertence ao projeto
        const existingMilestone = await prisma.projectMilestone.findFirst({
            where: { id: milestoneId, projectId }
        });
        if (!existingMilestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found'
            });
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        if (dueDate !== undefined)
            updateData.dueDate = dueDate ? new Date(dueDate) : null;
        if (order !== undefined)
            updateData.order = order;
        const milestone = await prisma.projectMilestone.update({
            where: { id: milestoneId },
            data: updateData
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'milestone_updated', `Atualizou o marco "${milestone.name}"`, { milestoneId: milestone.id, milestoneName: milestone.name });
        res.json({
            success: true,
            data: milestone
        });
    }
    catch (error) {
        logger_1.default.error('Error updating project milestone', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update milestone'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/milestones/:id
 * Deleta um milestone (tarefas ficam sem marco)
 */
router.delete('/projects/:projectId/milestones/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const milestoneId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(milestoneId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or milestone ID'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: { id: projectId, accountId }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Verifica se o milestone existe e pertence ao projeto
        const milestone = await prisma.projectMilestone.findFirst({
            where: { id: milestoneId, projectId }
        });
        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found'
            });
        }
        // Deleta o milestone (tarefas passam para milestoneId: null devido ao onDelete: SetNull)
        await prisma.projectMilestone.delete({
            where: { id: milestoneId }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'milestone_deleted', `Deletou o marco "${milestone.name}"`, { milestoneId: milestone.id, milestoneName: milestone.name });
        res.json({
            success: true,
            message: 'Milestone deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting project milestone', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to delete milestone'
        });
    }
});
/**
 * PATCH /api/projects/:projectId/milestones/:id/reorder
 * Reordena milestones
 */
router.patch('/projects/:projectId/milestones/:id/reorder', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const milestoneId = parseInt(req.params.id);
        const { newOrder } = req.body;
        if (isNaN(projectId) || isNaN(milestoneId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or milestone ID'
            });
        }
        if (newOrder === undefined || isNaN(newOrder)) {
            return res.status(400).json({
                success: false,
                error: 'New order is required'
            });
        }
        // Verifica se o projeto existe e pertence à conta
        const project = await prisma.project.findFirst({
            where: { id: projectId, accountId }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        // Verifica se o milestone existe e pertence ao projeto
        const milestone = await prisma.projectMilestone.findFirst({
            where: { id: milestoneId, projectId }
        });
        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found'
            });
        }
        const updatedMilestone = await prisma.projectMilestone.update({
            where: { id: milestoneId },
            data: { order: newOrder }
        });
        res.json({
            success: true,
            data: updatedMilestone
        });
    }
    catch (error) {
        logger_1.default.error('Error reordering milestone', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to reorder milestone'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projectMilestones.js.map