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
 * GET /api/projects/:projectId/tasks
 * Lista todas as tarefas do projeto
 */
router.get('/projects/:projectId/tasks', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
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
        const tasks = await prisma.projectTask.findMany({
            where: { projectId },
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
        });
        res.json({
            success: true,
            data: tasks
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project tasks', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tasks'
        });
    }
});
/**
 * POST /api/projects/:projectId/tasks
 * Cria uma nova tarefa no projeto
 */
router.post('/projects/:projectId/tasks', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const { title, description, status, priority, dueDate, milestoneId, assignedTo } = req.body;
        logger_1.default.info('POST /projects/:projectId/tasks chamado', {
            projectId,
            userId,
            accountId,
            title,
            bodyKeys: Object.keys(req.body)
        });
        if (isNaN(projectId)) {
            logger_1.default.warn('Project ID inválido', { projectId: req.params.projectId });
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        if (!title || title.trim().length < 3) {
            logger_1.default.warn('Título inválido', { title, length: title?.length });
            return res.status(400).json({
                success: false,
                error: 'Title is required and must be at least 3 characters'
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
        // Valida milestone se fornecido
        if (milestoneId) {
            const milestone = await prisma.projectMilestone.findFirst({
                where: { id: milestoneId, projectId }
            });
            if (!milestone) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid milestone ID'
                });
            }
        }
        const task = await prisma.projectTask.create({
            data: {
                projectId,
                title: title.trim(),
                description: description?.trim() || null,
                status: status || 'pending',
                priority: priority || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                milestoneId: milestoneId || null,
                assignedTo: assignedTo || null,
                createdBy: userId
            },
            include: {
                milestone: {
                    select: {
                        id: true,
                        name: true,
                        dueDate: true
                    }
                }
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'task_created', `Criou a tarefa "${task.title}"`, { taskId: task.id, taskTitle: task.title });
        logger_1.default.info('Tarefa criada com sucesso', {
            taskId: task.id,
            projectId,
            title: task.title
        });
        res.json({
            success: true,
            data: task
        });
    }
    catch (error) {
        logger_1.default.error('Error creating project task', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to create task'
        });
    }
});
/**
 * PUT /api/projects/:projectId/tasks/:id
 * Atualiza uma tarefa
 */
router.put('/projects/:projectId/tasks/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const taskId = parseInt(req.params.id);
        const { title, description, status, priority, dueDate, milestoneId, assignedTo } = req.body;
        if (isNaN(projectId) || isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or task ID'
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
        // Verifica se a tarefa existe e pertence ao projeto
        const existingTask = await prisma.projectTask.findFirst({
            where: { id: taskId, projectId }
        });
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        // Valida milestone se fornecido
        if (milestoneId) {
            const milestone = await prisma.projectMilestone.findFirst({
                where: { id: milestoneId, projectId }
            });
            if (!milestone) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid milestone ID'
                });
            }
        }
        const updateData = {};
        if (title !== undefined)
            updateData.title = title.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        if (status !== undefined) {
            updateData.status = status;
            // Se completar, registra completedAt
            if (status === 'completed' && existingTask.status !== 'completed') {
                updateData.completedAt = new Date();
            }
            else if (status !== 'completed') {
                updateData.completedAt = null;
            }
        }
        if (priority !== undefined)
            updateData.priority = priority;
        if (dueDate !== undefined)
            updateData.dueDate = dueDate ? new Date(dueDate) : null;
        if (milestoneId !== undefined)
            updateData.milestoneId = milestoneId || null;
        if (assignedTo !== undefined)
            updateData.assignedTo = assignedTo || null;
        const task = await prisma.projectTask.update({
            where: { id: taskId },
            data: updateData,
            include: {
                milestone: {
                    select: {
                        id: true,
                        name: true,
                        dueDate: true
                    }
                }
            }
        });
        // Registra atividade
        if (status === 'completed' && existingTask.status !== 'completed') {
            await (0, projectActivity_1.logActivity)(projectId, userId, 'task_completed', `Completou a tarefa "${task.title}"`, { taskId: task.id, taskTitle: task.title });
        }
        else {
            await (0, projectActivity_1.logActivity)(projectId, userId, 'task_updated', `Atualizou a tarefa "${task.title}"`, { taskId: task.id, taskTitle: task.title });
        }
        res.json({
            success: true,
            data: task
        });
    }
    catch (error) {
        logger_1.default.error('Error updating project task', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update task'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/tasks/:id
 * Deleta uma tarefa
 */
router.delete('/projects/:projectId/tasks/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const taskId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or task ID'
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
        // Verifica se a tarefa existe e pertence ao projeto
        const task = await prisma.projectTask.findFirst({
            where: { id: taskId, projectId }
        });
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        await prisma.projectTask.delete({
            where: { id: taskId }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'task_deleted', `Deletou a tarefa "${task.title}"`, { taskId: task.id, taskTitle: task.title });
        res.json({
            success: true,
            message: 'Task deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting project task', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to delete task'
        });
    }
});
/**
 * PATCH /api/projects/:projectId/tasks/:id/status
 * Atualiza apenas o status da tarefa
 */
router.patch('/projects/:projectId/tasks/:id/status', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const taskId = parseInt(req.params.id);
        const { status } = req.body;
        if (isNaN(projectId) || isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or task ID'
            });
        }
        if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status'
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
        // Verifica se a tarefa existe e pertence ao projeto
        const existingTask = await prisma.projectTask.findFirst({
            where: { id: taskId, projectId }
        });
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        const updateData = { status };
        if (status === 'completed' && existingTask.status !== 'completed') {
            updateData.completedAt = new Date();
        }
        else if (status !== 'completed') {
            updateData.completedAt = null;
        }
        const task = await prisma.projectTask.update({
            where: { id: taskId },
            data: updateData
        });
        // Registra atividade
        if (status === 'completed' && existingTask.status !== 'completed') {
            await (0, projectActivity_1.logActivity)(projectId, userId, 'task_completed', `Completou a tarefa "${task.title}"`, { taskId: task.id, taskTitle: task.title });
        }
        res.json({
            success: true,
            data: task
        });
    }
    catch (error) {
        logger_1.default.error('Error updating task status', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update task status'
        });
    }
});
/**
 * PATCH /api/projects/:projectId/tasks/:id/move
 * Move tarefa para outro milestone
 */
router.patch('/projects/:projectId/tasks/:id/move', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const taskId = parseInt(req.params.id);
        const { milestoneId } = req.body;
        if (isNaN(projectId) || isNaN(taskId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or task ID'
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
        // Verifica se a tarefa existe e pertence ao projeto
        const task = await prisma.projectTask.findFirst({
            where: { id: taskId, projectId }
        });
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        // Valida milestone se fornecido
        let milestoneName = 'Sem Marco';
        if (milestoneId) {
            const milestone = await prisma.projectMilestone.findFirst({
                where: { id: milestoneId, projectId }
            });
            if (!milestone) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid milestone ID'
                });
            }
            milestoneName = milestone.name;
        }
        const updatedTask = await prisma.projectTask.update({
            where: { id: taskId },
            data: { milestoneId: milestoneId || null },
            include: {
                milestone: {
                    select: {
                        id: true,
                        name: true,
                        dueDate: true
                    }
                }
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'task_moved', `Moveu a tarefa "${task.title}" para "${milestoneName}"`, { taskId: task.id, taskTitle: task.title, milestoneId, milestoneName });
        res.json({
            success: true,
            data: updatedTask
        });
    }
    catch (error) {
        logger_1.default.error('Error moving task', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to move task'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projectTasks.js.map