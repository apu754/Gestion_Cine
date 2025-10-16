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

//Esta funcion establece el codigo de verificacion para el usuario

export async function setVerifyCode(userId, { codeHash, expires_at, resend_after }) {
  const result = await query(
    `UPDATE ${schema}.users
       SET verify_code_hash = $2,
           verify_expires_at = $3,
           resend_after = $4,
           verify_attempts = 0
     WHERE id = $1`,
    [userId, codeHash, expires_at, resend_after]
  );

  if (result.rowCount === 0) {
    throw new Error('No se pudo actualizar el código de verificación en la base de datos');
  }
}



//Esta funcion marca el email del usuario como verificado

export async function markEmailVerified(userId) {
    await query(
        `UPDATE ${schema}.users
       SET email_verified_at = NOW(),
           verify_code_hash = NULL,
           verify_expires_at = NULL,
           verify_attempts = 0,
           resend_after = NULL
     WHERE id = $1`,
        [userId]
    );
}

//Esta funcion actualiza la fecha del ultimo login del usuario
export async function incrementVerifyAttempts(userId) {
    await query(
        `UPDATE ${schema}.users SET verify_attempts = verify_attempts + 1 WHERE id = $1`,
        [userId]
    );
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

