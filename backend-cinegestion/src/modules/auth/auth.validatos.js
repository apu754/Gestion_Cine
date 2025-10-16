import Joi from 'joi';
// RFC 5322 simplificado para validación de email, validamos con Joi email

const phoneE164 = Joi.string().pattern(/^\+?[1-9]\d{7,14}$/); // E.164 genérico
const cc = Joi.string().pattern(/^\d{6,10}$/);                // CC Colombia: 6–10 dígitos aprox.
const ce = Joi.string().pattern(/^[A-Za-z0-9]{5,15}$/);     // CE alfanum 5–15
const pp = Joi.string().pattern(/^[A-Za-z0-9]{6,9}$/);        // Pasaporte 6–9 aprox.

export const registerSchema = Joi.object({
    email: Joi.string().email({ tlds: { allow: true } }).required(),
    password: Joi.string().min(16).required(), // longitud entre 16 que es lo que sugiere CISA
    first_name: Joi.string().min(2).max(50).required(), // longitud entre 2 y 50
    last_name: Joi.string().min(2).max(50).required(), // longitud entre 2 y 50
    phone: phoneE164.optional().allow(null, ''),
    document_type: Joi.string().valid('CC','CE','PP').required(),
    /* istanbul ignore next */
    // eslint-disable-next-line unicorn/no-thenable
    document_number: Joi.alternatives().conditional('document_type', {
      switch: [
        { is: 'CC', then: cc.required() }, // NOSONAR: Joi schema keyword, not a thenable
        { is: 'CE', then: ce.required() }, // NOSONAR: Joi schema keyword, not a thenable
        { is: 'PP', then: pp.required() }, // NOSONAR: Joi schema keyword, not a thenable
      ],
      otherwise: Joi.forbidden(),
    }),

    birth_date: Joi.date().iso().less('now').required(),   // no futuro
  }).custom((value, helpers) => {
    // Regla +18 opcional en registro (si quieres forzarlo ya aquí):
    const birth = new Date(value.birth_date);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear()
      - ( (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) ? 1 : 0);

    // Si NO quieres forzar +18 en registro, comenta este bloque.
    if (age < 18) {
      return helpers.error('any.custom', { message: 'Debes ser mayor de 18 años para registrarte.' });
    }
    return value;
  }, 'age-check');

  export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });