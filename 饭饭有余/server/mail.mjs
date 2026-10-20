export function createMailer(env = process.env, { fetch: request = globalThis.fetch } = {}) {
  const port = Number(env.SMTP_PORT || 465);
  const provider = env.MAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : 'smtp');
  const configured = provider === 'brevo'
    ? Boolean(env.BREVO_API_KEY && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.MAIL_FROM || ''))
    : provider === 'smtp' && Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM && [465, 587].includes(port));
  let transport;
  return {
    configured,
    async send({ to, subject, text }) {
      if (!configured) throw new Error('MAIL_NOT_CONFIGURED');
      if (provider === 'brevo') {
        const html = text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
        const response = await request('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': env.BREVO_API_KEY },
          body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || '饭饭有余' }, to: [{ email: to }], subject, textContent: text, htmlContent: `<div style="white-space:pre-wrap">${html}</div>` })
        });
        if (response.status !== 201) throw new Error('MAIL_PROVIDER_REJECTED');
        const result = await response.json().catch(() => ({}));
        if (!result.messageId) throw new Error('MAIL_PROVIDER_INVALID_RESPONSE');
        return;
      }
      if (!transport) {
        const { default: nodemailer } = await import('nodemailer');
        transport = nodemailer.createTransport({
          host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port === 587,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
          tls: { minVersion: 'TLSv1.2' }, logger: false, debug: false,
          disableFileAccess: true, disableUrlAccess: true
        });
      }
      await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
    }
  };
}
