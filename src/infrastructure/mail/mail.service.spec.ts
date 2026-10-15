import { ConfigService } from '@nestjs/config';
import { codeEmail } from './code-email';
import { MailService, parseAddress } from './mail.service';

const service = (env: Record<string, string>) => new MailService(new ConfigService(env));

describe('MailService', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends through the Resend API with inline images', async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    const mail = codeEmail('login', '123456');

    await service({ RESEND_API_KEY: 're_test', MAIL_FROM: 'App <no-reply@example.com>' }).send(
      'ana@example.com',
      mail.subject,
      mail.text,
      mail.html,
      mail.attachments,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: 'App <no-reply@example.com>', to: ['ana@example.com'], subject: mail.subject });
    expect(body.attachments.map((a: { content_id: string }) => a.content_id)).toEqual(
      mail.attachments.map((a) => a.cid),
    );
    expect(body.attachments[0].content.length).toBeGreaterThan(100);
  });

  it('throws with the API detail when Resend refuses', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 }));
    await expect(service({ RESEND_API_KEY: 're_test' }).send('a@example.com', 's', 't', '<p>h</p>')).rejects.toThrow(
      /403.*domain not verified/,
    );
  });

  it('sends through the Brevo API with images served by the API', async () => {
    fetchMock.mockResolvedValue(new Response('{"messageId":"1"}', { status: 201 }));
    const mail = codeEmail('email_verification', '654321');

    await service({
      BREVO_API_KEY: 'xkeysib-test',
      MAIL_FROM: 'Financial App <app@gmail.com>',
      RENDER_EXTERNAL_URL: 'https://api.onrender.com/',
    }).send('ana@example.com', mail.subject, mail.text, mail.html, mail.attachments);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'Financial App', email: 'app@gmail.com' });
    expect(body.to).toEqual([{ email: 'ana@example.com' }]);
    expect(body.textContent).toContain('654321');
    expect(body.htmlContent).not.toContain('cid:');
    expect(body.htmlContent).toContain('src="https://api.onrender.com/api/mail-assets/logo-mark.png"');
    expect(body.htmlContent).toContain('src="https://api.onrender.com/api/mail-assets/code-illustration.png"');
    expect(body.attachment).toBeUndefined();
  });

  it('prefers Resend when both APIs are configured', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await service({ RESEND_API_KEY: 're_test', BREVO_API_KEY: 'xkeysib' }).send('a@example.com', 's', 't', '<p>h</p>');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
  });

  it('throws with the API detail when Brevo refuses', async () => {
    fetchMock.mockResolvedValue(new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 }));
    await expect(service({ BREVO_API_KEY: 'bad' }).send('a@example.com', 's', 't', '<p>h</p>')).rejects.toThrow(
      /401.*Key not found/,
    );
  });

  it.each([
    ['Financial App <app@gmail.com>', { name: 'Financial App', email: 'app@gmail.com' }],
    ['"Financial App" <app@gmail.com>', { name: 'Financial App', email: 'app@gmail.com' }],
    ['<app@gmail.com>', { email: 'app@gmail.com' }],
    [' app@gmail.com ', { email: 'app@gmail.com' }],
  ])('parses the sender %s', (value, expected) => {
    expect(parseAddress(value)).toEqual(expected);
  });

  it('only logs when no provider is configured', async () => {
    await service({}).send('a@example.com', 's', 't', '<p>h</p>');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
