// src/modules/auth/auth.service.js
import bcrypt from 'bcrypt';
import { sendMail } from '../../config/mailer.js';
import { generateNumericCode, hashCode } from '../../utils/verify-code.js';
import { ConflictError, AuthError, HttpError } from '../../common/errors.js';
import { createUser, findByEmail, createSession, updateLastLogin, setVerifyCode, markEmailVerified, incrementVerifyAttempts} from './user.repository.js';
import { signFor } from './jwt.js';


const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
const RESEND_COOLDOWN_MIN = Number(process.env.RESEND_COOLDOWN_MIN || 2);
const MAX_VERIFY_ATTEMPTS = Number(process.env.MAX_VERIFY_ATTEMPTS || 6);

const TTL_MIN = Number(process.env.VERIFY_CODE_TTL_MIN || 15); // minutos que dura el código
// ---------- REGISTER ----------
export async function register(input) {

  // Verifica si el usuario ya existe
  const existing = await findByEmail(input.email);
  if (existing) {
    
    throw new ConflictError('Este usuario ya está registrado, ¿Desea iniciar sesión?');
  }

  // Crea el usuario
  
  let user = existing;
  if(!user) {
    const password_hash = await bcrypt.hash(input.password, rounds);
    user = await createUser({
    email: input.email,
    password_hash,
    first_name: input.first_name,
    last_name: input.last_name,
    role: 'USER',
    phone: input.phone,
    document_type: input.document_type,
    document_number: input.document_number,
    birth_date: input.birth_date,
  });
  }

  //generar codigo 
  const code = generateNumericCode(6); // ejemplo: '324324'
  if (!code) {
  throw new Error('No se generó el código de verificación');
}
  const codeHash = hashCode(code); // guardas el hash en la BD
  const expires_at = new Date(Date.now() + TTL_MIN * 60_000); // 15 minutos para que expire
  const resend_after = new Date(Date.now() + RESEND_COOLDOWN_MIN * 60_000); // 2 minutos para reenviar

  // persistir hash + expiracion + reenvio
  await setVerifyCode(user.id, { codeHash, expires_at, resend_after });

  // Enviar correo con el código y link opcional
    const subject = 'Verifica tu correo • CineGestión';
    const verifyUrl = `${process.env.APP_URL}/api/auth/verify?email=${encodeURIComponent(user.email)}&code=${code}`;
    const html = `
      <div style="background: linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%); padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; line-height: 1.6; color: #333;">
        <!-- Container principal -->
        <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header con gradiente -->
          <div style="background: linear-gradient(135deg, #f4c430 0%, #ffd700 100%); padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; color: #333; font-size: 28px; font-weight: 700;">CineGestión</h1>
          </div>

          <!-- Contenido principal -->
          <div style="padding: 40px 30px;">
            <p style="margin: 0 0 20px 0; color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Verificación de correo</p>
            
            <h2 style="margin: 0 0 10px 0; color: #333; font-size: 24px; font-weight: 700;">¡Bienvenido!</h2>
            <p style="margin: 0 0 30px 0; color: #777; font-size: 14px;">Para continuar, verifica tu dirección de correo usando el código de abajo.</p>

            <!-- Código de verificación -->
            <div style="background: linear-gradient(135deg, #f4c430 0%, #ffd700 100%); padding: 25px; border-radius: 8px; text-align: center; margin: 30px 0; border-left: 4px solid #d4a017;">
              <p style="margin: 0 0 10px 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Tu código de verificación</p>
              <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #333; font-family: 'Courier New', monospace;">${code}</div>
              <p style="margin: 10px 0 0 0; color: #888; font-size: 12px;">Válido por ${TTL_MIN} minutos</p>
            </div>

            <!-- Divider -->
            <div style="height: 1px; background: #e5e5e5; margin: 30px 0;"></div>

            <!-- Instrucciones alternativas -->
            <div style="background: #f9f9f9; padding: 20px; border-radius: 6px; border-left: 4px solid #d4a017;">
              <p style="margin: 0 0 10px 0; color: #555; font-size: 13px; font-weight: 600;">¿Problemas con el botón?</p>
              <p style="margin: 0; color: #777; font-size: 12px;">Ingresa este código directamente en la aplicación:</p>
              <p style="margin: 10px 0 0 0; color: #333; font-size: 14px; font-weight: 600; font-family: 'Courier New', monospace; word-break: break-all;">${code}</p>
            </div>

            <!-- Footer -->
            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #999; font-size: 11px; text-align: center;">
              Este correo fue enviado a <strong>${user.email}</strong>. No compartas este código con nadie.
            </p>
          </div>

          <!-- Footer gris -->
          <div style="background: #f5f5f5; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; color: #999; font-size: 11px;">© 2025 CineGestión. Todos los derechos reservados.</p>
          </div>
        </div>
      </div>
    `;

    const text = `Código de verificación: ${code}. Caduca en ${TTL_MIN} minutos. Verificar: ${verifyUrl}`;
    await sendMail({ to: user.email, subject, html, text });

    // Respuesta
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      email_verified_at: user.email_verified_at || null,
      message: 'Usuario registrado. Enviamos un código de verificación a tu correo.',
    };

  
}

// ---------------verifica el código numérico (6 dígitos) y marca el email como verificado ------------------

export async function verifyEmail({ email, code }) {
  const user = await findByEmail(email);
  if (!user) {
    
    const e = new Error('Usuario no encontrado');
    e.status = 404;
    throw e; // ← 404
  }
  if (user.email_verified_at) {
    return { alreadyVerified: true, message: 'El correo ya fue verificado previamente.' };
  }

  // límites
  if (user.verify_attempts >= MAX_VERIFY_ATTEMPTS) {
    const e = new Error('Demasiados intentos, solicita un nuevo código');
    e.status = 429; throw e;
  }
  // verifica existencia, expiración y validez
  if (!user.verify_code_hash || !user.verify_expires_at) {
    const e = new Error('No hay un código pendiente. Solicita reenvío.');
    e.status = 400; throw e;
  }
  // expirado?
  if (new Date(user.verify_expires_at) < new Date()) {
    const e = new Error('El código expiró. Solicita reenvío.');
    e.status = 410; throw e;
  }
  // inválido?
  const codeHash = hashCode(code);
  if (codeHash !== user.verify_code_hash) {
    await incrementVerifyAttempts(user.id);
    const e = new Error('Código inválido');
    e.status = 401; throw e;
  }
  // OK, marca como verificado
  // limpia código y marcas
  await markEmailVerified(user.id);
  return { verified: true };
}

// ----------------Reenvía el código de verificación al email (si no está verificado aún)------------------
export async function resendVerificationCode({ email }) {
  const user = await findByEmail(email);
  if (!user) {
    
    const e = new Error('Usuario no encontrado');
    e.status = 404;
    throw e;
  }

  // Asegura que el campo sea null o undefined antes de marcarlo como no verificado
  if ( user.email_verified_at !== null) {
    return { alreadyVerified: true, message: 'El correo ya fue verificado previamente.' };
  }

  if(user.resend_after) {
  const resendAfterTime = new Date(user.resend_after).getTime();
  const now = Date.now();
  
  if(resendAfterTime > now) {
    const diffMs = resendAfterTime - now;
    const mins = Math.ceil(diffMs / 60000);
    const e = new Error(`Puedes solicitar un nuevo código en ${mins} minuto(s)`);
    e.status = 429;
    throw e;
  }
}


  // generar y enviar de nuevo

  const code = generateNumericCode(6); // ejemplo: '324324'
    const codeHash = hashCode(code); // guardas el hash en la BD
  const expiresAt = new Date(Date.now() + (Number(process.env.VERIFY_CODE_TTL_MIN || 15) * 60_000)); // 15 minutos para que expire
  const resendAfter = new Date(Date.now() + (Number(process.env.RESEND_COOLDOWN_MIN || 2) * 60_000));

  await setVerifyCode(user.id, { 
  codeHash, 
  expires_at: expiresAt, 
  resend_after: resendAfter 
});


  const subject = 'Tu nuevo código de verificación';
const html = `
  <div style="background: linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%); padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; line-height: 1.6; color: #333;">
    <!-- Container principal -->
    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      
      <!-- Header con gradiente -->
      <div style="background: linear-gradient(135deg, #f4c430 0%, #ffd700 100%); padding: 30px 20px; text-align: center;">
        <h1 style="margin: 0; color: #333; font-size: 28px; font-weight: 700;">CineGestión</h1>
      </div>

      <!-- Contenido principal -->
      <div style="padding: 40px 30px;">
        <p style="margin: 0 0 20px 0; color: #d4a017; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">⚡ Nuevo código</p>
        
        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 24px; font-weight: 700;">Código de verificación</h2>
        <p style="margin: 0 0 30px 0; color: #777; font-size: 14px;">Solicitaste un nuevo código. Aquí está:</p>

        <!-- Código de verificación -->
        <div style="background: linear-gradient(135deg, #f4c430 0%, #ffd700 100%); padding: 30px; border-radius: 8px; text-align: center; margin: 30px 0; border-left: 4px solid #d4a017;">
          <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #333; font-family: 'Courier New', monospace;">${code}</div>
          <p style="margin: 15px 0 0 0; color: #888; font-size: 12px;">Válido por ${process.env.VERIFY_CODE_TTL_MIN || 15} minutos</p>
        </div>

        <!-- Nota importante -->
        <div style="background: #fef9e7; padding: 16px; border-radius: 6px; border-left: 4px solid #f4c430; margin: 20px 0;">
          <p style="margin: 0; color: #555; font-size: 12px;">
            <strong>Importante:</strong> No compartas este código con nadie. Si no solicitaste este código, ignora este mensaje.
          </p>
        </div>

        <!-- Divider -->
        <div style="height: 1px; background: #e5e5e5; margin: 30px 0;"></div>

        <!-- Footer -->
        <p style="margin: 0; color: #999; font-size: 11px; text-align: center;">
          © 2025 CineGestión. Todos los derechos reservados.
        </p>
      </div>
    </div>
  </div>
`;

const text = `Nuevo código: ${code}`;
await sendMail({ to: email, subject, html, text });
return { resent: true, message: 'Código reenviado' };

}


// ---------- LOGIN ----------
export async function login({ email, password, device_info, ip_address }) {
  const user = await findByEmail(email);
  if (!user) throw new HttpError(401, 'Usuario no encontrado', 'USER_NOT_FOUND');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AuthError('Credenciales inválidas');

  //Bloqueo por email no verificado cuando la política está activa
  if (process.env.ENFORCE_EMAIL_VERIFIED === 'true' && !user.email_verified_at) {
    const err = new AuthError('Debes verificar tu correo antes de iniciar sesión');
    err.status = 403;                 // Asegura que tu middleware responda 403
    throw err;
  }

  // genera token y OBTÉN el jti/exp que realmente van dentro del JWT
  const { token, jti, expMinutes, expUnix } = signFor(user);

  // usa la expiración REAL del token
  const expires_at = new Date(expUnix * 1000);

  await createSession({
    user_id: user.id,
    jwt_id: jti,
    expires_at,
    device_info: device_info ?? null,
    ip_address:  ip_address  ?? null,
  });

  await updateLastLogin(user.id);
  return { token, expires_in_minutes: expMinutes };
}

