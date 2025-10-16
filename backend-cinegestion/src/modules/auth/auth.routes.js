import { Router } from "express";
import { postRegister, postLogin, postLogout, getMe, postLogoutAll, postResend, postVerify } from "./auth.controller.js";
import  { authGuarda } from "../../middleware/authGuard.js";

const router = Router();

// Ruta para registrar un nuevo usuario
router.post('/register', postRegister);
// Ruta para verificar el email del usuario
router.post('/verify', postVerify);
// Ruta para reenviar el codigo de verificacion
router.post('/resend', postResend);
// Ruta para iniciar sesión
router.post('/login', postLogin);
// Ruta para cerrar sesión 
router.post('/logout', authGuarda, postLogout);

// Ruta para obtener información del usuario autenticado
router.get('/me', authGuarda, getMe);




// Ruta para cerrar todas las sesiones del usuario autenticado
router.post('/logout-all', authGuarda, postLogoutAll);


export default router;