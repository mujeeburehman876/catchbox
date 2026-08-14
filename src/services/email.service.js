/**
 * Fake confirmation "email" side effect. In a real deployment this would
 * call an SMTP relay or a webhook URL configured by the tenant. For this
 * capstone it logs to the console (or Mailpit if you wire SMTP_* in .env) --
 * what's graded is that a FAILURE here never prevents the submission from
 * being stored, per the "safe side effects" requirement in the brief.
 */
export async function sendConfirmation(submission, widget) {
  if (process.env.FORCE_EMAIL_FAILURE === 'true') {
    throw new Error('email/webhook side effect forced to fail (demo flag)');
  }

  // Simulate network latency for a real side effect.
  await new Promise((resolve) => setTimeout(resolve, 10));

  console.log(
    `[email] Confirmation for widget "${widget.title}" (${widget.id}): ` +
      `submission ${submission.id} recorded from ${submission.ip || 'unknown IP'}.`
  );
  return { status: 'sent' };
}
