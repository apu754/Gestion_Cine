import e from "cors";

export class AppError extends Error {
    constructor(message, status = 400, code = 'APP_ERROR') {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export class ConflictError extends AppError {
    constructor(msg = 'Recurso en conflicto') {
        super(msg, 409, 'CONFLICT');
    }
}
export class AuthError extends AppError {
    constructor(msg = 'Credenciales inválidas') {
        super(msg, 401, 'AUTH_ERROR');
    }
}