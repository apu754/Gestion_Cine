import cors from 'cors';
import helmet from 'helmet';

export function security(app){
    app.use(helmet());
    app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
}