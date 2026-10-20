import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from './mail.mjs';

test('HTTPS mail uses verified sender and API key without SMTP or HTML injection', async () => {
  const calls = [];
  const mail = createMailer({ MAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-secret', MAIL_FROM: 'sender@example.com' }, { fetch: async (url, options) => { calls.push({ url, options }); return { status: 201, json: async () => ({ messageId: '<test@example.com>' }) }; } });
  assert.equal(mail.configured, true);
  await mail.send({ to: 'recipient@example.com', subject: '验证', text: '验证码 12345678 <script> & test' });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['api-key'], 'test-secret');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sender.email, 'sender@example.com');
  assert.equal(body.to[0].email, 'recipient@example.com');
  assert.equal(body.htmlContent.includes('<script>'), false);
  assert.equal(body.textContent.includes('12345678'), true);
  assert.equal(calls[0].options.body.includes('test-secret'), false);
});
test('HTTPS mail rejects missing configuration, quota failures and false success', async () => {
  assert.equal(createMailer({ MAIL_PROVIDER: 'brevo', MAIL_FROM: 'sender@example.com' }).configured, false);
  assert.equal(createMailer({ MAIL_PROVIDER: 'unknown', BREVO_API_KEY: 'test', MAIL_FROM: 'sender@example.com' }).configured, false);
  for (const status of [400, 401, 429, 500]) {
    const mail = createMailer({ BREVO_API_KEY: 'test', MAIL_FROM: 'sender@example.com' }, { fetch: async () => ({ status }) });
    await assert.rejects(mail.send({ to: 'recipient@example.com', subject: 'test', text: 'test' }), /MAIL_PROVIDER_REJECTED/);
  }
  const mail = createMailer({ BREVO_API_KEY: 'test', MAIL_FROM: 'sender@example.com' }, { fetch: async () => ({ status: 201, json: async () => ({}) }) });
  await assert.rejects(mail.send({ to: 'recipient@example.com', subject: 'test', text: 'test' }), /MAIL_PROVIDER_INVALID_RESPONSE/);
});
