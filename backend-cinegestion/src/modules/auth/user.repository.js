import { query } from "../../config/db.js";

const schema = process.env.PGSCHEMA || 'cinegestion';
//Esta funcion busca un usuario por su email en la base de datos
export async function findByEmail(email) {
    const { rows } = await query(`SELECT * FROM ${schema}.users WHERE email = $1`, [email]);
    return rows[0] || null;
}

//Esta funcion crea un nuevo usuario en la base de datos
export async function createUser({ email, password_hash, first_name, last_name, role='USER',
  phone, document_type, document_number, birth_date}) {
    const q = `
    INSERT INTO ${schema}.users
    (email, password_hash, first_name, last_name, role, phone, document_type, document_number, birth_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`;
    const { rows } = await query(q, [email, password_hash, first_name, last_name, role,
        phone, document_type, document_number, birth_date]);
    return rows[0];
}

//Esta funcion actualiza la fecha del ultimo login del usuario

export async function updateLastLogin(userId) {
    await query(`UPDATE ${schema}.users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

//Esta funcion crea una nueva sesion de usuario en la base de datos

export async function createSession({ user_id, jwt_id, expires_at, device_info, ip_address }) {
    const q = `
    INSERT INTO ${schema}.user_sessions
    (user_id, jwt_id, expires_at, device_info, ip_address)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *`;
    const { rows } = await query(q, [user_id, jwt_id, expires_at, device_info, ip_address]);
    return rows[0];
}