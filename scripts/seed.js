import 'dotenv/config';
import { runMigrations, db } from '../src/db/index.js';
import { authService } from '../src/services/auth.service.js';
import { widgetsService } from '../src/services/widgets.service.js';
import { submissionsService } from '../src/services/submissions.service.js';

async function seed() {
  runMigrations();

  const email = 'demo@flyrank.dev';
  const password = 'demo-password-123';

  let auth;
  try {
    auth = await authService.register({ email, password });
    console.log(`Created demo tenant: ${email} / ${password}`);
  } catch {
    auth = await authService.login({ email, password });
    console.log(`Demo tenant already existed, logged in as ${email}`);
  }

  const widget = widgetsService.create(auth.tenant.id, {
    type: 'signup_form',
    title: 'Join our newsletter',
    description: 'One email a week. No spam, ever.',
    fields: [
      { name: 'email', label: 'Email address', type: 'email', required: true },
      { name: 'name', label: 'Your name', type: 'text', required: false },
    ],
    buttonText: 'Subscribe',
    displayOptions: { theme: 'light', position: 'inline' },
  });

  console.log(`Created demo widget: ${widget.id} ("${widget.title}")`);
  console.log(`Embed snippet: <script src="${process.env.BASE_URL || 'http://localhost:3000'}/widget.js?id=${widget.id}" async></script>`);

  // Seed a few realistic submissions so the dashboard isn't empty on first look.
  const seedSubmissions = [
    { data: { email: 'ada@example.com', name: 'Ada' }, ip: '8.8.8.8' },
    { data: { email: 'grace@example.com', name: 'Grace' }, ip: '1.1.1.1' },
    { data: { email: 'linus@example.com', name: 'Linus' }, ip: '9.9.9.9' },
  ];

  for (const s of seedSubmissions) {
    await submissionsService.submit({
      widgetId: widget.id,
      payload: { website: '', data: s.data, idempotencyKey: undefined },
      ip: s.ip,
      // deterministic mock so seeding never depends on network access
      geoProviders: [async () => ({ country: 'United States', city: 'Demo City', provider: 'provider_a' })],
    });
  }
  console.log(`Seeded ${seedSubmissions.length} demo submissions.`);

  console.log('\nLogin token for testing:');
  console.log(auth.token);

  db.close?.();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
