import { Request, Response, NextFunction } from 'express';
export interface ApiTokenRequest extends Request {
    apiTokenData?: {
        id: number;
        accountId: number;
        userId: number;
        permissions: string[];
    };
}
/**
 * Middleware para autenticar requisições usando API Token
 * Header: Authorization: Bearer <token>
 */
export declare function authenticateApiToken(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Middleware para verificar se o token tem uma permissão específica
 */
export declare function requirePermission(permission: string): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=apiToken.d.ts.map