import crypto from 'node:crypto';

export function generateNumericCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += crypto.randomInt(0, 10);
  }
  return code;
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}
