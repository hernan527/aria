"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const projectActivity_1 = require("../utils/projectActivity");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const checkResourcePermission_1 = require("../middleware/checkResourcePermission");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/**
 * GET /api/projects/:projectId/discussions
 * Lista todas as discussões do projeto com contagem de comentários
 */
router.get('/projects/:projectId/discussions', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const jwt = req.jwt;
        const apiToken = req.apiToken;
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
        const discussions = await prisma.projectDiscussion.findMany({
            where: { projectId },
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
        });
        // Busca dados dos usuários
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        // Mescla dados
        const discussionsWithUserData = discussions.map(discussion => {
            const creator = agents.find((a) => a.id === discussion.createdBy);
            const commentsWithUserData = discussion.comments.map(comment => {
                const commentCreator = agents.find((a) => a.id === comment.createdBy);
                return {
                    ...comment,
                    creator: commentCreator ? {
                        id: commentCreator.id,
                        name: commentCreator.name,
                        email: commentCreator.email,
                        avatar_url: commentCreator.avatar_url
                    } : null
                };
            });
            return {
                ...discussion,
                comments: commentsWithUserData,
                commentCount: discussion.comments.length,
                creator: creator ? {
                    id: creator.id,
                    name: creator.name,
                    email: creator.email,
                    avatar_url: creator.avatar_url
                } : null
            };
        });
        res.json({
            success: true,
            data: discussionsWithUserData
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project discussions', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch discussions'
        });
    }
});
/**
 * POST /api/projects/:projectId/discussions
 * Cria uma nova discussão
 */
router.post('/projects/:projectId/discussions', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const { subject, description } = req.body;
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        if (!subject || subject.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Subject is required'
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
        const discussion = await prisma.projectDiscussion.create({
            data: {
                projectId,
                subject: subject.trim(),
                description: description?.trim() || null,
                createdBy: userId
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'discussion_created', `Criou a discussão "${discussion.subject}"`, { discussionId: discussion.id, discussionSubject: discussion.subject });
        res.json({
            success: true,
            data: discussion
        });
    }
    catch (error) {
        logger_1.default.error('Error creating project discussion', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to create discussion'
        });
    }
});
/**
 * PUT /api/projects/:projectId/discussions/:id
 * Atualiza uma discussão
 */
router.put('/projects/:projectId/discussions/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const discussionId = parseInt(req.params.id);
        const { subject, description } = req.body;
        if (isNaN(projectId) || isNaN(discussionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or discussion ID'
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
        // Verifica se a discussão existe e pertence ao projeto
        const existingDiscussion = await prisma.projectDiscussion.findFirst({
            where: { id: discussionId, projectId }
        });
        if (!existingDiscussion) {
            return res.status(404).json({
                success: false,
                error: 'Discussion not found'
            });
        }
        const updateData = {};
        if (subject !== undefined)
            updateData.subject = subject.trim();
        if (description !== undefined)
            updateData.description = description?.trim() || null;
        const discussion = await prisma.projectDiscussion.update({
            where: { id: discussionId },
            data: updateData
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'discussion_updated', `Atualizou a discussão "${discussion.subject}"`, { discussionId: discussion.id, discussionSubject: discussion.subject });
        res.json({
            success: true,
            data: discussion
        });
    }
    catch (error) {
        logger_1.default.error('Error updating project discussion', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update discussion'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/discussions/:id
 * Deleta uma discussão (e todos os comentários em cascata)
 */
router.delete('/projects/:projectId/discussions/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const discussionId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(discussionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or discussion ID'
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
        // Verifica se a discussão existe e pertence ao projeto
        const discussion = await prisma.projectDiscussion.findFirst({
            where: { id: discussionId, projectId }
        });
        if (!discussion) {
            return res.status(404).json({
                success: false,
                error: 'Discussion not found'
            });
        }
        // Deleta a discussão (comentários deletados em cascata)
        await prisma.projectDiscussion.delete({
            where: { id: discussionId }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'discussion_deleted', `Deletou a discussão "${discussion.subject}"`, { discussionId: discussion.id, discussionSubject: discussion.subject });
        res.json({
            success: true,
            message: 'Discussion deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting project discussion', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to delete discussion'
        });
    }
});
/**
 * POST /api/projects/:projectId/discussions/:id/comments
 * Adiciona um comentário a uma discussão
 */
router.post('/projects/:projectId/discussions/:id/comments', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const discussionId = parseInt(req.params.id);
        const { content } = req.body;
        if (isNaN(projectId) || isNaN(discussionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or discussion ID'
            });
        }
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Content is required'
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
        // Verifica se a discussão existe e pertence ao projeto
        const discussion = await prisma.projectDiscussion.findFirst({
            where: { id: discussionId, projectId }
        });
        if (!discussion) {
            return res.status(404).json({
                success: false,
                error: 'Discussion not found'
            });
        }
        const comment = await prisma.projectComment.create({
            data: {
                discussionId,
                content: content.trim(),
                createdBy: userId
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'comment_added', `Comentou na discussão "${discussion.subject}"`, { discussionId: discussion.id, discussionSubject: discussion.subject, commentId: comment.id });
        res.json({
            success: true,
            data: comment
        });
    }
    catch (error) {
        logger_1.default.error('Error adding comment to discussion', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to add comment'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/discussions/:discussionId/comments/:id
 * Deleta um comentário de uma discussão
 */
router.delete('/projects/:projectId/discussions/:discussionId/comments/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const discussionId = parseInt(req.params.discussionId);
        const commentId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(discussionId) || isNaN(commentId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project, discussion or comment ID'
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
        // Verifica se a discussão existe e pertence ao projeto
        const discussion = await prisma.projectDiscussion.findFirst({
            where: { id: discussionId, projectId }
        });
        if (!discussion) {
            return res.status(404).json({
                success: false,
                error: 'Discussion not found'
            });
        }
        // Verifica se o comentário existe e pertence à discussão
        const comment = await prisma.projectComment.findFirst({
            where: { id: commentId, discussionId }
        });
        if (!comment) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found'
            });
        }
        // Deleta o comentário
        await prisma.projectComment.delete({
            where: { id: commentId }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'comment_deleted', `Deletou um comentário da discussão "${discussion.subject}"`, { discussionId: discussion.id, discussionSubject: discussion.subject, commentId: comment.id });
        res.json({
            success: true,
            message: 'Comment deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting comment', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to delete comment'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projectDiscussions.js.map