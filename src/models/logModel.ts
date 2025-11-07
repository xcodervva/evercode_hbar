import client from '../database/db';

export interface LogContext {
    transactionId?: string;
    userId?: string;
    [key: string]: any;
}

export const createLog = async (
    logLevel: string,
    message: string,
    context: LogContext = {}
): Promise<void> => {
    const query = `
    INSERT INTO logs (log_level, message, context)
    VALUES ($1, $2, $3) RETURNING id;
  `;

    try {
        const res = await client.query(query, [logLevel, message, JSON.stringify(context)]);
        console.log(`Log entry created with ID: ${res.rows[0].id}`);
    } catch (err) {
        console.error('Error writing to the database:', err);
    }
};
