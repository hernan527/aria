"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const logger_1 = __importDefault(require("../utils/logger"));
const projectActivity_1 = require("../utils/projectActivity");
const chatwoot_1 = __importDefault(require("../services/chatwoot"));
const checkResourcePermission_1 = require("../middleware/checkResourcePermission");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Configurar armazenamento multer
const storage = multer_1.default.diskStorage({
    destination: async (req, file, cb) => {
        const projectId = req.params.projectId;
        const uploadDir = path_1.default.join(process.cwd(), 'uploads', 'projects', projectId);
        // Garantir que o diretório existe
        try {
            await promises_1.default.mkdir(uploadDir, { recursive: true });
        }
        catch (error) {
            logger_1.default.error('Error creating upload directory:', error);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Gerar nome único: timestamp-random-originalname
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const ext = path_1.default.extname(file.originalname);
        const nameWithoutExt = path_1.default.basename(file.originalname, ext);
        cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
    }
});
// Filtro de arquivo (aceitar qualquer tipo, mas com limite de tamanho)
const fileFilter = (req, file, cb) => {
    // Aceita todos os tipos de arquivo
    cb(null, true);
};
const upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
    }
});
/**
 * GET /api/projects/:projectId/files
 * Lista todos os arquivos do projeto
 */
router.get('/projects/:projectId/files', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
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
        const files = await prisma.projectFile.findMany({
            where: { projectId },
            orderBy: {
                uploadedAt: 'desc'
            }
        });
        // Busca dados dos usuários para mostrar quem fez upload
        const agents = await chatwoot_1.default.getAccountAgents(accountId, jwt, apiToken);
        // Mescla dados
        const filesWithUserData = files.map(file => {
            const agent = agents.find((a) => a.id === file.uploadedBy);
            return {
                ...file,
                uploader: agent ? {
                    id: agent.id,
                    name: agent.name,
                    email: agent.email,
                    avatar_url: agent.avatar_url
                } : null
            };
        });
        res.json({
            success: true,
            data: filesWithUserData
        });
    }
    catch (error) {
        logger_1.default.error('Error fetching project files', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch files'
        });
    }
});
/**
 * POST /api/projects/:projectId/files
 * Upload de arquivo para o projeto
 */
router.post('/projects/:projectId/files', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), upload.single('file'), async (req, res) => {
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
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
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
        const file = await prisma.projectFile.create({
            data: {
                projectId,
                filename: req.file.filename,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                uploadedBy: userId
            }
        });
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'file_uploaded', `Enviou o arquivo "${file.originalName}"`, { fileId: file.id, fileName: file.originalName, fileSize: file.size });
        logger_1.default.info('Project file uploaded successfully', {
            projectId,
            userId,
            filename: file.filename,
            originalName: file.originalName,
            size: file.size,
        });
        res.json({
            success: true,
            data: file
        });
    }
    catch (error) {
        logger_1.default.error('Error uploading project file', { error });
        // Erro de tamanho de arquivo
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File size exceeds 50MB limit'
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});
/**
 * GET /api/projects/:projectId/files/:id/download
 * Download de arquivo do projeto
 */
router.get('/projects/:projectId/files/:id/download', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const projectId = parseInt(req.params.projectId);
        const fileId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(fileId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or file ID'
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
        // Verifica se o arquivo existe e pertence ao projeto
        const file = await prisma.projectFile.findFirst({
            where: { id: fileId, projectId }
        });
        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
        const filePath = path_1.default.join(process.cwd(), 'uploads', 'projects', projectId.toString(), file.filename);
        // Verifica se o arquivo existe no sistema de arquivos
        try {
            await promises_1.default.access(filePath);
        }
        catch (error) {
            logger_1.default.error('File not found in filesystem', { filePath });
            return res.status(404).json({
                success: false,
                error: 'File not found in storage'
            });
        }
        // Download do arquivo
        res.download(filePath, file.originalName, (err) => {
            if (err) {
                logger_1.default.error('Error downloading file', { error: err });
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Failed to download file'
                    });
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('Error downloading project file', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to download file'
        });
    }
});
/**
 * DELETE /api/projects/:projectId/files/:id
 * Deleta um arquivo do projeto
 */
router.delete('/projects/:projectId/files/:id', (0, checkResourcePermission_1.checkResourcePermission)('projectsAccess'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const projectId = parseInt(req.params.projectId);
        const fileId = parseInt(req.params.id);
        if (isNaN(projectId) || isNaN(fileId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project or file ID'
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
        // Verifica se o arquivo existe e pertence ao projeto
        const file = await prisma.projectFile.findFirst({
            where: { id: fileId, projectId }
        });
        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
        const filePath = path_1.default.join(process.cwd(), 'uploads', 'projects', projectId.toString(), file.filename);
        // Deleta do banco
        await prisma.projectFile.delete({
            where: { id: fileId }
        });
        // Tenta deletar do sistema de arquivos
        try {
            await promises_1.default.unlink(filePath);
        }
        catch (error) {
            logger_1.default.warn('Failed to delete file from filesystem', { filePath, error });
            // Não retorna erro pois já deletou do banco
        }
        // Registra atividade
        await (0, projectActivity_1.logActivity)(projectId, userId, 'file_deleted', `Deletou o arquivo "${file.originalName}"`, { fileId: file.id, fileName: file.originalName });
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error('Error deleting project file', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to delete file'
        });
    }
});
exports.default = router;
//# sourceMappingURL=projectFiles.js.map