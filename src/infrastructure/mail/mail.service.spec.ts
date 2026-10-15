import { ConfigService } from '@nestjs/config';
import { codeEmail } from './code-email';
import { MailService } from './mail.service';

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

  it('only logs when no provider is configured', async () => {
    await service({}).send('a@example.com', 's', 't', '<p>h</p>');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
