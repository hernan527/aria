"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketIO = initializeSocketIO;
const socket_io_1 = require("socket.io");
const logger_1 = __importDefault(require("../utils/logger"));
function initializeSocketIO(httpServer) {
    // Parse múltiplas origens do CORS
    const corsOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
        : ['*'];
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: corsOrigins.includes('*') ? '*' : corsOrigins,
            methods: ['GET', 'POST'],
            credentials: true
        },
        path: '/socket.io'
    });
    io.on('connection', (socket) => {
        logger_1.default.info('Client connected', { socketId: socket.id });
        socket.on('join_account', (accountId) => {
            socket.join(`account_${accountId}`);
            logger_1.default.info('Client joined account room', { socketId: socket.id, accountId });
        });
        // Chat interno: join em uma sala de chat específica
        socket.on('join_chat', (chatId) => {
            socket.join(`chat_${chatId}`);
            logger_1.default.info('Client joined chat room', { socketId: socket.id, chatId });
        });
        // Chat interno: leave de uma sala de chat específica
        socket.on('leave_chat', (chatId) => {
            socket.leave(`chat_${chatId}`);
            logger_1.default.info('Client left chat room', { socketId: socket.id, chatId });
        });
        socket.on('disconnect', () => {
            logger_1.default.info('Client disconnected', { socketId: socket.id });
        });
    });
    logger_1.default.info('Socket.IO initialized');
    return io;
}
//# sourceMappingURL=index.js.map