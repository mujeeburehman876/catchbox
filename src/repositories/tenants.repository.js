import { db } from '../db/index.js';

export const tenantsRepository = {
  create({ id, email, passwordHash }) {
    db.prepare(
      `INSERT INTO tenants (id, email, password_hash) VALUES (?, ?, ?)`
    ).run(id, email, passwordHash);
    return this.findById(id);
  },

  findByEmail(email) {
    return db.prepare(`SELECT * FROM tenants WHERE email = ?`).get(email);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(id);
  },
};
