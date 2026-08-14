import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { tenantsRepository } from '../repositories/tenants.repository.js';
import { HttpError } from '../middleware/errorHandler.js';

function signToken(tenant) {
  return jwt.sign(
    { sub: tenant.id, email: tenant.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

export const authService = {
  async register({ email, password }) {
    const existing = tenantsRepository.findByEmail(email);
    if (existing) {
      throw new HttpError(409, 'email_taken', 'An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const tenant = tenantsRepository.create({ id: `tnt_${nanoid(12)}`, email, passwordHash });
    return { token: signToken(tenant), tenant: { id: tenant.id, email: tenant.email } };
  },

  async login({ email, password }) {
    const tenant = tenantsRepository.findByEmail(email);
    if (!tenant) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');

    const ok = await bcrypt.compare(password, tenant.password_hash);
    if (!ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');

    return { token: signToken(tenant), tenant: { id: tenant.id, email: tenant.email } };
  },
};
