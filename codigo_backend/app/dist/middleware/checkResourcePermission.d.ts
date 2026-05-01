import { Request, Response, NextFunction } from 'express';
export declare function checkResourcePermission(resourceKey: string): (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Middleware para verificar múltiplos recursos (OR - basta ter 1)
 */
export declare function checkAnyResourcePermission(...resourceKeys: string[]): (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=checkResourcePermission.d.ts.map