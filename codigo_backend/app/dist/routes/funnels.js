"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../services/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Helper para verificar se usuário é admin
// Chatwoot armazena role como int no DB (1=admin, 0=agent) ou string via API
function isAdmin(req) {
    const authReq = req;
    const role = authReq.user?.role;
    return role === 'administrator' || role === 1;
}
// Cria ou retorna o funil de sistema (Status Chatwoot)
async function getOrCreateSystemFunnel(accountId) {
    // Tenta encontrar o funil de sistema existente
    let systemFunnel = await database_1.default.funnel.findFirst({
        where: { accountId, isSystem: true },
        include: {
            stages: { orderBy: { order: 'asc' } },
            allowedUsers: true
        }
    });
    // Se não existe, cria com os 3 status padrão do Chatwoot
    if (!systemFunnel) {
        systemFunnel = await database_1.default.funnel.create({
            data: {
                name: 'Status Chatwoot',
                accountId,
                color: '#6366F1',
                order: -1, // Sempre primeiro
                isPublic: true,
                isSystem: true,
                stages: {
                    create: [
                        { name: 'Aberto', color: '#3B82F6', order: 0, chatwootStatus: 'open' },
                        { name: 'Pendente', color: '#F59E0B', order: 1, chatwootStatus: 'pending' },
                        { name: 'Resolvido', color: '#10B981', order: 2, chatwootStatus: 'resolved' }
                    ]
                }
            },
            include: {
                stages: { orderBy: { order: 'asc' } },
                allowedUsers: true
            }
        });
        logger_1.default.info('System funnel created', { accountId, funnelId: systemFunnel.id });
    }
    return systemFunnel;
}
// GET /api/funnels - Lista todos os funis que o usuário pode ver
router.get('/', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const userId = authReq.user.id;
    const userIsAdmin = isAdmin(req);
    try {
        // Busca todos os funis da conta (não cria mais o funil de sistema automaticamente)
        // Admin vê todos (ativos e inativos), outros usuários só veem ativos
        const allFunnels = await database_1.default.funnel.findMany({
            where: {
                accountId,
                // Não-admins só veem funis ativos
                ...(userIsAdmin ? {} : { isActive: true })
            },
            include: {
                stages: {
                    orderBy: { order: 'asc' }
                },
                allowedUsers: true
            },
            orderBy: { order: 'asc' }
        });
        // Filtra: admin vê tudo, outros só veem públicos ou onde têm acesso
        const funnels = userIsAdmin
            ? allFunnels
            : allFunnels.filter(f => f.isPublic || f.allowedUsers.some(u => u.userId === userId));
        // Remove allowedUsers da resposta para não-admins
        const response = funnels.map(f => ({
            ...f,
            allowedUsers: userIsAdmin ? f.allowedUsers : undefined
        }));
        res.json({ success: true, data: response });
    }
    catch (error) {
        logger_1.default.error('Error fetching funnels', { error });
        res.status(500).json({ error: 'Failed to fetch funnels' });
    }
});
// POST /api/funnels/system - Cria/ativa o funil de sistema (apenas admin)
router.post('/system', async (req, res) => {
    const authReq = req;
    logger_1.default.info('Create system funnel request', {
        userId: authReq.user?.id,
        userRole: authReq.user?.role,
        accountId: authReq.user?.account_id
    });
    if (!isAdmin(req)) {
        logger_1.default.warn('System funnel creation denied - user is not admin', {
            userId: authReq.user?.id,
            userRole: authReq.user?.role
        });
        return res.status(403).json({ error: 'Apenas administradores podem ativar o funil de sistema' });
    }
    const accountId = authReq.user.account_id;
    try {
        // Verifica se já existe
        const existing = await database_1.default.funnel.findFirst({
            where: { accountId, isSystem: true },
            include: {
                stages: { orderBy: { order: 'asc' } },
                allowedUsers: true
            }
        });
        if (existing) {
            return res.json({
                success: true,
                data: existing,
                message: 'Funil de sistema já existe'
            });
        }
        // Cria o funil de sistema
        const systemFunnel = await getOrCreateSystemFunnel(accountId);
        res.json({
            success: true,
            data: systemFunnel,
            message: 'Funil de sistema ativado com sucesso'
        });
    }
    catch (error) {
        logger_1.default.error('Error creating system funnel', { error });
        res.status(500).json({ error: 'Falha ao ativar funil de sistema' });
    }
});
// GET /api/funnels/:id - Busca um funil específico
router.get('/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const userId = authReq.user.id;
    const funnelId = parseInt(req.params.id);
    const userIsAdmin = isAdmin(req);
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId },
            include: {
                stages: {
                    orderBy: { order: 'asc' },
                    include: {
                        cards: {
                            orderBy: { order: 'asc' }
                        }
                    }
                },
                allowedUsers: true
            }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Verifica acesso
        if (!userIsAdmin && !funnel.isPublic && !funnel.allowedUsers.some(u => u.userId === userId)) {
            return res.status(403).json({ error: 'Acesso negado a este funil' });
        }
        res.json({
            success: true,
            data: {
                ...funnel,
                allowedUsers: userIsAdmin ? funnel.allowedUsers : undefined
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching funnel', { error });
        res.status(500).json({ error: 'Failed to fetch funnel' });
    }
});
// POST /api/funnels - Cria novo funil
router.post('/', async (req, res) => {
    const authReq = req;
    logger_1.default.info('Create funnel request', {
        userId: authReq.user?.id,
        userRole: authReq.user?.role,
        accountId: authReq.user?.account_id,
        body: req.body
    });
    const accountId = authReq.user.account_id;
    const { name, color, stages, isPublic, allowedUserIds } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        // Conta funis existentes para definir ordem
        const count = await database_1.default.funnel.count({ where: { accountId } });
        const funnel = await database_1.default.funnel.create({
            data: {
                name,
                accountId,
                color: color || '#3B82F6',
                order: count,
                isPublic: isPublic !== false, // Público por padrão (true), a menos que explicitamente false
                isSystem: false, // Funis customizados NUNCA são de sistema
                stages: stages?.length ? {
                    create: stages.map((stage, index) => ({
                        name: stage.name,
                        color: stage.color || '#6B7280',
                        order: index
                    }))
                } : undefined, // Não cria stages automáticas - usuário adiciona manualmente
                // Adiciona usuários permitidos se não for público
                allowedUsers: !isPublic && allowedUserIds?.length ? {
                    create: allowedUserIds.map((userId) => ({ userId }))
                } : undefined
            },
            include: {
                stages: {
                    orderBy: { order: 'asc' }
                },
                allowedUsers: true
            }
        });
        logger_1.default.info('Funnel created', { funnelId: funnel.id, accountId, isPublic, allowedUserIds });
        res.status(201).json({ success: true, data: funnel });
    }
    catch (error) {
        logger_1.default.error('Error creating funnel', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            userId: authReq.user?.id,
            accountId: authReq.user?.account_id
        });
        res.status(500).json({
            error: 'Failed to create funnel',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// PUT /api/funnels/:id - Atualiza funil (apenas admin)
router.put('/:id', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem editar funis' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.id);
    const { name, color, order, isPublic, allowedUserIds } = req.body;
    try {
        const existing = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Atualiza o funil
        const funnel = await database_1.default.funnel.update({
            where: { id: funnelId },
            data: {
                ...(name && { name }),
                ...(color && { color }),
                ...(order !== undefined && { order }),
                ...(isPublic !== undefined && { isPublic })
            },
            include: {
                stages: {
                    orderBy: { order: 'asc' }
                },
                allowedUsers: true
            }
        });
        // Se allowedUserIds foi fornecido, atualiza os acessos
        if (allowedUserIds !== undefined) {
            // Remove todos os acessos existentes
            await database_1.default.funnelAccess.deleteMany({
                where: { funnelId }
            });
            // Adiciona novos acessos (se não for público)
            if (!isPublic && allowedUserIds.length > 0) {
                await database_1.default.funnelAccess.createMany({
                    data: allowedUserIds.map((userId) => ({
                        funnelId,
                        userId
                    }))
                });
            }
            // Busca novamente com os acessos atualizados
            const updatedFunnel = await database_1.default.funnel.findUnique({
                where: { id: funnelId },
                include: {
                    stages: { orderBy: { order: 'asc' } },
                    allowedUsers: true
                }
            });
            logger_1.default.info('Funnel updated', { funnelId, accountId, isPublic, allowedUserIds });
            return res.json({ success: true, data: updatedFunnel });
        }
        logger_1.default.info('Funnel updated', { funnelId, accountId });
        res.json({ success: true, data: funnel });
    }
    catch (error) {
        logger_1.default.error('Error updating funnel', { error });
        res.status(500).json({ error: 'Failed to update funnel' });
    }
});
// DELETE /api/funnels/:id - Remove funil (apenas admin)
router.delete('/:id', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem excluir funis' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.id);
    try {
        const existing = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Permite excluir qualquer funil, incluindo o de sistema (para desativá-lo)
        await database_1.default.funnel.delete({
            where: { id: funnelId }
        });
        logger_1.default.info('Funnel deleted', {
            funnelId,
            accountId,
            wasSystemFunnel: existing.isSystem
        });
        res.json({ success: true, message: 'Funnel deleted' });
    }
    catch (error) {
        logger_1.default.error('Error deleting funnel', { error });
        res.status(500).json({ error: 'Failed to delete funnel' });
    }
});
// PATCH /api/funnels/:id/toggle - Ativa/desativa funil (apenas admin)
router.patch('/:id/toggle', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem ativar/desativar funis' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.id);
    try {
        const existing = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Inverte o estado atual
        const newState = !existing.isActive;
        const updated = await database_1.default.funnel.update({
            where: { id: funnelId },
            data: { isActive: newState },
            include: {
                stages: { orderBy: { order: 'asc' } },
                allowedUsers: true
            }
        });
        logger_1.default.info('Funnel toggled', {
            funnelId,
            accountId,
            isSystem: existing.isSystem,
            newState
        });
        res.json({
            success: true,
            data: updated,
            message: newState ? 'Funil ativado' : 'Funil desativado'
        });
    }
    catch (error) {
        logger_1.default.error('Error toggling funnel', { error });
        res.status(500).json({ error: 'Failed to toggle funnel' });
    }
});
// POST /api/funnels/:id/stages - Adiciona stage ao funil (apenas admin)
router.post('/:id/stages', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.id);
    const { name, color } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        const count = await database_1.default.stage.count({ where: { funnelId } });
        const stage = await database_1.default.stage.create({
            data: {
                name,
                funnelId,
                color: color || '#6B7280',
                order: count
            }
        });
        logger_1.default.info('Stage created', { stageId: stage.id, funnelId });
        res.status(201).json({ success: true, data: stage });
    }
    catch (error) {
        logger_1.default.error('Error creating stage', { error });
        res.status(500).json({ error: 'Failed to create stage' });
    }
});
// PUT /api/funnels/:funnelId/stages/reorder - Reordena stages (apenas admin)
// IMPORTANTE: Esta rota DEVE vir ANTES de /:funnelId/stages/:stageId para não conflitar
router.put('/:funnelId/stages/reorder', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem reordenar etapas' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.funnelId);
    const { stageIds } = req.body; // Array de IDs na nova ordem
    if (!Array.isArray(stageIds) || stageIds.length === 0) {
        return res.status(400).json({ error: 'stageIds deve ser um array não vazio' });
    }
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Atualiza a ordem de cada stage
        await database_1.default.$transaction(stageIds.map((stageId, index) => database_1.default.stage.update({
            where: { id: stageId },
            data: { order: index }
        })));
        // Busca stages atualizados
        const stages = await database_1.default.stage.findMany({
            where: { funnelId },
            orderBy: { order: 'asc' }
        });
        logger_1.default.info('Stages reordered', { funnelId, stageIds });
        res.json({ success: true, data: stages });
    }
    catch (error) {
        logger_1.default.error('Error reordering stages', { error });
        res.status(500).json({ error: 'Failed to reorder stages' });
    }
});
// PUT /api/funnels/:funnelId/stages/:stageId - Atualiza stage (apenas admin)
router.put('/:funnelId/stages/:stageId', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem editar etapas' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.funnelId);
    const stageId = parseInt(req.params.stageId);
    const { name, color, order, automations } = req.body;
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Se estiver definindo automação "newTicket", remove de outros stages do mesmo funil
        if (automations?.newTicket === true) {
            const otherStages = await database_1.default.stage.findMany({
                where: { funnelId, id: { not: stageId } }
            });
            for (const otherStage of otherStages) {
                if (otherStage.automations) {
                    try {
                        const otherAuto = JSON.parse(otherStage.automations);
                        if (otherAuto.newTicket) {
                            otherAuto.newTicket = false;
                            await database_1.default.stage.update({
                                where: { id: otherStage.id },
                                data: { automations: JSON.stringify(otherAuto) }
                            });
                        }
                    }
                    catch {
                        // Ignora erros de parse
                    }
                }
            }
        }
        const stage = await database_1.default.stage.update({
            where: { id: stageId },
            data: {
                ...(name && { name }),
                ...(color && { color }),
                ...(order !== undefined && { order }),
                ...(automations !== undefined && { automations: JSON.stringify(automations) })
            }
        });
        logger_1.default.info('Stage updated', { stageId, funnelId, hasAutomations: !!automations });
        res.json({ success: true, data: stage });
    }
    catch (error) {
        logger_1.default.error('Error updating stage', { error });
        res.status(500).json({ error: 'Failed to update stage' });
    }
});
// DELETE /api/funnels/:funnelId/stages/:stageId - Remove stage (apenas admin)
router.delete('/:funnelId/stages/:stageId', async (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Apenas administradores podem excluir etapas' });
    }
    const authReq = req;
    const accountId = authReq.user.account_id;
    const funnelId = parseInt(req.params.funnelId);
    const stageId = parseInt(req.params.stageId);
    try {
        const funnel = await database_1.default.funnel.findFirst({
            where: { id: funnelId, accountId }
        });
        if (!funnel) {
            return res.status(404).json({ error: 'Funnel not found' });
        }
        // Verifica se é uma coluna de status do Chatwoot (não pode ser excluída)
        const stage = await database_1.default.stage.findUnique({
            where: { id: stageId }
        });
        if (stage?.chatwootStatus) {
            return res.status(403).json({ error: 'Não é possível excluir colunas de status do Chatwoot' });
        }
        await database_1.default.stage.delete({
            where: { id: stageId }
        });
        logger_1.default.info('Stage deleted', { stageId, funnelId });
        res.json({ success: true, message: 'Stage deleted' });
    }
    catch (error) {
        logger_1.default.error('Error deleting stage', { error });
        res.status(500).json({ error: 'Failed to delete stage' });
    }
});
// POST /api/funnels/:funnelId/stages/:stageId/cards - Adiciona conversa ao stage
router.post('/:funnelId/stages/:stageId/cards', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const stageId = parseInt(req.params.stageId);
    const { conversationId } = req.body;
    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required' });
    }
    try {
        // Verifica se já existe e atualiza, ou cria novo
        const card = await database_1.default.card.upsert({
            where: {
                conversationId_accountId: {
                    conversationId,
                    accountId
                }
            },
            update: {
                stageId,
                updatedAt: new Date()
            },
            create: {
                conversationId,
                stageId,
                accountId,
                order: 0
            }
        });
        logger_1.default.info('Card added to stage', { conversationId, stageId });
        res.json({ success: true, data: card });
    }
    catch (error) {
        logger_1.default.error('Error adding card', { error });
        res.status(500).json({ error: 'Failed to add card' });
    }
});
// DELETE /api/funnels/cards/:conversationId - Remove conversa de todos os funis
router.delete('/cards/:conversationId', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const conversationId = parseInt(req.params.conversationId);
    try {
        await database_1.default.card.deleteMany({
            where: { conversationId, accountId }
        });
        logger_1.default.info('Card removed', { conversationId, accountId });
        res.json({ success: true, message: 'Card removed' });
    }
    catch (error) {
        logger_1.default.error('Error removing card', { error });
        res.status(500).json({ error: 'Failed to remove card' });
    }
});
// POST /api/funnels/standalone-cards - Cria card avulso (sem conversationId)
router.post('/standalone-cards', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const { title, stageId, description } = req.body;
    if (!title?.trim()) {
        return res.status(400).json({ error: 'Título é obrigatório' });
    }
    if (!stageId) {
        return res.status(400).json({ error: 'stageId é obrigatório' });
    }
    try {
        // Verifica se o stage pertence a um funil da conta
        const stage = await database_1.default.stage.findFirst({
            where: { id: parseInt(stageId), funnel: { accountId } },
            include: { funnel: true }
        });
        if (!stage) {
            return res.status(404).json({ error: 'Stage não encontrado' });
        }
        if (stage.funnel.isSystem) {
            return res.status(400).json({ error: 'Não é possível criar cards avulsos no funil de status do Chatwoot' });
        }
        const card = await database_1.default.card.create({
            data: {
                conversationId: null,
                stageId: stage.id,
                accountId,
                customName: title.trim(),
                order: 0,
            }
        });
        logger_1.default.info('Standalone card created', { cardId: card.id, stageId: stage.id, accountId });
        res.json({ success: true, data: card });
    }
    catch (error) {
        logger_1.default.error('Error creating standalone card', { error });
        res.status(500).json({ error: 'Erro ao criar card' });
    }
});
// PATCH /api/funnels/standalone-cards/:id - Atualiza card avulso
router.patch('/standalone-cards/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const cardId = parseInt(req.params.id);
    const { title, stageId } = req.body;
    try {
        const card = await database_1.default.card.findFirst({
            where: { id: cardId, accountId, conversationId: null }
        });
        if (!card)
            return res.status(404).json({ error: 'Card não encontrado' });
        const updated = await database_1.default.card.update({
            where: { id: cardId },
            data: {
                ...(title?.trim() ? { customName: title.trim() } : {}),
                ...(stageId ? { stageId: parseInt(stageId) } : {}),
                updatedAt: new Date()
            }
        });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        logger_1.default.error('Error updating standalone card', { error });
        res.status(500).json({ error: 'Erro ao atualizar card' });
    }
});
// DELETE /api/funnels/standalone-cards/:id - Deleta card avulso
router.delete('/standalone-cards/:id', async (req, res) => {
    const authReq = req;
    const accountId = authReq.user.account_id;
    const cardId = parseInt(req.params.id);
    try {
        const card = await database_1.default.card.findFirst({
            where: { id: cardId, accountId, conversationId: null }
        });
        if (!card)
            return res.status(404).json({ error: 'Card não encontrado' });
        await database_1.default.card.delete({ where: { id: cardId } });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.default.error('Error deleting standalone card', { error });
        res.status(500).json({ error: 'Erro ao deletar card' });
    }
});
exports.default = router;
//# sourceMappingURL=funnels.js.map