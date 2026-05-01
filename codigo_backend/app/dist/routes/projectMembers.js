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
 * GET /api/projects/:projectId/members
 * Lista todos os membros do projeto com dados do Chatwoot
 */
router.get('/projects/:projectId/members', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
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
        const members = await prisma.projectMember.findMany({
            where: { projectId },
            orderBy: {
                addedAt: 'asc'
            }
        });
        // Busca dados dos usuários no Chatwoot
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        // Mescla dados
        const membersWithUserData = members.map(member => {
            const agent = agents.find((a) => a.id === member.userId);
            return {
                ...member,
                user: agent ? {
                    id: agent.id,
                    name: agent.name,
                    email: agent.email,
                    avatar_url: agent.avatar_url,
                    availability_status: agent.availability_status
                } : null
            };
        });
        res.json({
            success: true,
            data: membersWithUserData
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project members', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch members'
        });
    }
});
/**
 * POST /api/projects/:projectId/members
 * Adiciona um membro ao projeto
 */
router.post('/projects/:projectId/members', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const currentUserId = req.userId;
        const jwt = req.jwt;
        const apiToken = req.apiToken;
        const projectId = parseInt(req.params.projectId);
        const { userId, role } = req.body;
        if (isNaN(projectId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project ID'
            });
        }
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        if (role && !['manager', 'member'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Must be "manager" or "member"'
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
        // Valida se o usuário existe no Chatwoot
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        const agent = agents.find((a) => a.id === userId);
        if (!agent) {
            return res.status(400).json({
                success: false,
                error: 'User not found in Chatwoot'
            });
        }
        // Verifica se já é membro
        const existingMember = await prisma.projectMember.findFirst({
            where: { projectId, userId }
        });
        if (existingMember) {
            return res.status(400).json({
                success: false,
                error: 'User is already a member of this project'
            });
        }
        const member = await prisma.projectMember.create({
            data: {
                projectId,
                userId,
                role: role || 'member',
                addedBy: currentUserId
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, currentUserId, 'member_added', `Adicionou ${agent.name} à equipe`, { memberId: member.id, userId, userName: agent.name, role: member.role });
        res.json({
            success: true,
            data: {
                ...member,
                user: {
                    id: agent.id,
                    name: agent.name,
                    email: agent.email,
                    avatar_url: agent.avatar_url,
                    availability_status: agent.availability_status
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error adding project member', { error });
        // Unique constraint violation
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                error: 'User is already a member of this project'
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to add member'
        });
    }
});
/**
 * PUT /api/projects/:projectId/members/:id
 * Atualiza o papel de um membro
 */
router.put('/projects/:projectId/members/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const currentUserId = req.userId;
        const jwt = req.jwt;
        const apiToken = req.apiToken;
        const projectId = parseInt(req.params.projectId);
        const memberId = parseInt(req.params.id);
        const { role } = req.body;
        if (isNaN(projectId) || isNaN(memberId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or member ID'
            });
        }
        if (!role || !['manager', 'member'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Must be "manager" or "member"'
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
        // Verifica se o membro existe e pertence ao projeto
        const existingMember = await prisma.projectMember.findFirst({
            where: { id: memberId, projectId }
        });
        if (!existingMember) {
            return res.status(404).json({
                success: false,
                error: 'Member not found'
            });
        }
        const member = await prisma.projectMember.update({
            where: { id: memberId },
            data: { role }
        });
        // Busca dados do usuário para a atividade
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        const agent = agents.find((a) => a.id === member.userId);
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, currentUserId, 'member_role_updated', `Alterou o papel de ${agent?.name || 'usuário'} para ${role === 'manager' ? 'Gerente' : 'Membro'}`, { memberId: member.id, userId: member.userId, userName: agent?.name, newRole: role });
        res.json({
            success: true,
            data: member
        });
    }
    catch (error) {
        logger_1.default.error('Error updating project member', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to update member'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/members/:id
 * Remove um membro do projeto
 */
router.delete('/projects/:projectId/members/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const currentUserId = req.userId;
        const jwt = req.jwt;
        const apiToken = req.apiToken;
        const projectId = parseInt(req.params.projectId);
        const memberId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(memberId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or member ID'
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
        // Verifica se o membro existe e pertence ao projeto
        const member = await prisma.projectMember.findFirst({
            where: { id: memberId, projectId }
        });
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Member not found'
            });
        }
        // Busca dados do usuário antes de deletar
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        const agent = agents.find((a) => a.id === member.userId);
        await prisma.projectMember.delete({
            where: { id: memberId }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, currentUserId, 'member_removed', `Removeu ${agent?.name || 'usuário'} da equipe`, { memberId: member.id, userId: member.userId, userName: agent?.name });
        res.json({
            success: true,
            message: 'Member removed successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error removing project member', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to remove member'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projectMembers.js.map