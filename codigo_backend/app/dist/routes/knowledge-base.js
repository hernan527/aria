"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
// @ts-ignore - pdf-parse não tem tipos oficiais
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const database_1 = __importDefault(require("../services/database"));
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Configuração do Multer para upload de PDFs
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path_1.default.join(__dirname, '../../uploads/knowledge-base');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Apenas arquivos PDF são permitidos'));
        }
    },
});
/**
 * GET /api/knowledge-bases
 * Lista todas as bases de conhecimento da conta
 */
router.get('/knowledge-bases', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const knowledgeBases = await database_1.default.knowledgeBase.findMany({
            where: { accountId },
            include: {
                documents: {
                    select: {
                        id: true,
                        originalName: true,
                        fileSize: true,
                        uploadedAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ data: knowledgeBases });
    }
    catch (error) {
        logger_1.default.error('Error fetching knowledge bases:', error);
        res.status(500).json({ error: 'Erro ao buscar bases de conhecimento' });
    }
});
/**
 * GET /api/knowledge-bases/:id
 * Detalhes de uma base de conhecimento
 */
router.get('/knowledge-bases/:id', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const id = parseInt(req.params.id);
        const knowledgeBase = await database_1.default.knowledgeBase.findFirst({
            where: { id, accountId },
            include: {
                documents: {
                    orderBy: { uploadedAt: 'desc' },
                },
            },
        });
        if (!knowledgeBase) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }
        res.json({ data: knowledgeBase });
    }
    catch (error) {
        logger_1.default.error('Error fetching knowledge base:', error);
        res.status(500).json({ error: 'Erro ao buscar base de conhecimento' });
    }
});
/**
 * POST /api/knowledge-bases
 * Cria uma nova base de conhecimento
 */
router.post('/knowledge-bases', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        const knowledgeBase = await database_1.default.knowledgeBase.create({
            data: {
                accountId,
                name: name.trim(),
                description: description?.trim() || null,
                createdBy: userId,
            },
            include: {
                documents: true,
            },
        });
        logger_1.default.info('Knowledge base created', { id: knowledgeBase.id, name: knowledgeBase.name });
        res.status(201).json({ data: knowledgeBase });
    }
    catch (error) {
        logger_1.default.error('Error creating knowledge base:', error);
        res.status(500).json({ error: 'Erro ao criar base de conhecimento' });
    }
});
/**
 * PUT /api/knowledge-bases/:id
 * Atualiza uma base de conhecimento
 */
router.put('/knowledge-bases/:id', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const id = parseInt(req.params.id);
        const { name, description } = req.body;
        const existing = await database_1.default.knowledgeBase.findFirst({
            where: { id, accountId },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }
        const updated = await database_1.default.knowledgeBase.update({
            where: { id },
            data: {
                name: name?.trim() || existing.name,
                description: description !== undefined ? description?.trim() || null : existing.description,
            },
            include: {
                documents: true,
            },
        });
        logger_1.default.info('Knowledge base updated', { id });
        res.json({ data: updated });
    }
    catch (error) {
        logger_1.default.error('Error updating knowledge base:', error);
        res.status(500).json({ error: 'Erro ao atualizar base de conhecimento' });
    }
});
/**
 * DELETE /api/knowledge-bases/:id
 * Deleta uma base de conhecimento e todos os seus documentos
 */
router.delete('/knowledge-bases/:id', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const id = parseInt(req.params.id);
        const existing = await database_1.default.knowledgeBase.findFirst({
            where: { id, accountId },
            include: { documents: true },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }
        // Deleta os arquivos físicos
        for (const doc of existing.documents) {
            try {
                if (fs_1.default.existsSync(doc.filePath)) {
                    fs_1.default.unlinkSync(doc.filePath);
                }
            }
            catch (err) {
                logger_1.default.warn('Failed to delete file', { filePath: doc.filePath, error: err });
            }
        }
        // Deleta do banco (cascade deleta os documentos)
        await database_1.default.knowledgeBase.delete({
            where: { id },
        });
        logger_1.default.info('Knowledge base deleted', { id });
        res.json({ message: 'Base de conhecimento deletada com sucesso' });
    }
    catch (error) {
        logger_1.default.error('Error deleting knowledge base:', error);
        res.status(500).json({ error: 'Erro ao deletar base de conhecimento' });
    }
});
/**
 * POST /api/knowledge-bases/:id/documents
 * Faz upload de um PDF para a base de conhecimento
 */
router.post('/knowledge-bases/:id/documents', auth_1.validateAuth, upload.single('file'), async (req, res) => {
    try {
        const accountId = req.accountId;
        const userId = req.userId;
        const id = parseInt(req.params.id);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        // Verifica se a base de conhecimento existe e pertence à conta
        const knowledgeBase = await database_1.default.knowledgeBase.findFirst({
            where: { id, accountId },
        });
        if (!knowledgeBase) {
            // Remove o arquivo enviado
            fs_1.default.unlinkSync(file.path);
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }
        // Extrai texto do PDF
        logger_1.default.info('Extracting text from PDF', { fileName: file.originalname });
        const dataBuffer = fs_1.default.readFileSync(file.path);
        const pdfData = await (0, pdf_parse_1.default)(dataBuffer);
        const extractedText = pdfData.text;
        if (!extractedText || extractedText.trim().length === 0) {
            fs_1.default.unlinkSync(file.path);
            return res.status(400).json({ error: 'Não foi possível extrair texto do PDF' });
        }
        // Salva documento no banco
        const document = await database_1.default.knowledgeDocument.create({
            data: {
                knowledgeBaseId: id,
                fileName: file.filename,
                originalName: file.originalname,
                fileSize: file.size,
                mimeType: file.mimetype,
                filePath: file.path,
                content: extractedText,
                uploadedBy: userId,
            },
        });
        logger_1.default.info('PDF uploaded and processed', {
            documentId: document.id,
            fileName: file.originalname,
            textLength: extractedText.length,
        });
        res.status(201).json({ data: document });
    }
    catch (error) {
        logger_1.default.error('Error uploading PDF:', error);
        // Remove arquivo se houve erro
        if (req.file && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Erro ao fazer upload do PDF' });
    }
});
/**
 * DELETE /api/knowledge-bases/:id/documents/:documentId
 * Remove um documento da base de conhecimento
 */
router.delete('/knowledge-bases/:id/documents/:documentId', auth_1.validateAuth, async (req, res) => {
    try {
        const accountId = req.accountId;
        const id = parseInt(req.params.id);
        const documentId = parseInt(req.params.documentId);
        // Verifica se a base existe e pertence à conta
        const knowledgeBase = await database_1.default.knowledgeBase.findFirst({
            where: { id, accountId },
        });
        if (!knowledgeBase) {
            return res.status(404).json({ error: 'Base de conhecimento não encontrada' });
        }
        // Busca o documento
        const document = await database_1.default.knowledgeDocument.findFirst({
            where: {
                id: documentId,
                knowledgeBaseId: id,
            },
        });
        if (!document) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }
        // Remove arquivo físico
        try {
            if (fs_1.default.existsSync(document.filePath)) {
                fs_1.default.unlinkSync(document.filePath);
            }
        }
        catch (err) {
            logger_1.default.warn('Failed to delete file', { filePath: document.filePath, error: err });
        }
        // Remove do banco
        await database_1.default.knowledgeDocument.delete({
            where: { id: documentId },
        });
        logger_1.default.info('Document deleted', { documentId, knowledgeBaseId: id });
        res.json({ message: 'Documento removido com sucesso' });
    }
    catch (error) {
        logger_1.default.error('Error deleting document:', error);
        res.status(500).json({ error: 'Erro ao deletar documento' });
    }
});
exports.default = router;
//# sourceMappingURL=knowledge-base.js.map