import { createLog } from '../models/logModel';

export const logError = async (message: string, context: any) => {
    await createLog('ERROR', message, context);
};

export const logInfo = async (message: string, context: any) => {
    await createLog('INFO', message, context);
};
