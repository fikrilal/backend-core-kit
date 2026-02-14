function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getBrandName(publicAppUrl: string | undefined): string {
  if (!publicAppUrl) return 'backend-core-kit';
  try {
    const url = new URL(publicAppUrl);
    return url.hostname || 'backend-core-kit';
  } catch {
    return 'backend-core-kit';
  }
}

export function buildVerifyEmailUrl(publicAppUrl: string, token: string): string | undefined {
  try {
    const url = new URL('/verify-email', publicAppUrl);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return undefined;
  }
}

export function renderVerificationEmailHtml(params: {
  brand: string;
  token: string;
  verifyUrl?: string;
  expiresAtIso: string;
}): string {
  const brand = escapeHtml(params.brand);
  const token = escapeHtml(params.token);
  const expiresAtIso = escapeHtml(params.expiresAtIso);
  const verifyUrl = params.verifyUrl;

  const preheader = `Verify your email for ${params.brand}`;

  const button = verifyUrl
    ? `<tr>
        <td style="padding: 24px 0;">
          <a href="${escapeHtml(verifyUrl)}"
             style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;display:inline-block;font-weight:600">
            Verify email
          </a>
        </td>
      </tr>`
    : '';

  const fallbackLink = verifyUrl
    ? `<tr>
        <td style="padding: 0 0 16px; color:#374151; font-size:14px; line-height:20px;">
          If the button doesn’t work, open this link:<br />
          <a href="${escapeHtml(verifyUrl)}" style="color:#2563eb; word-break:break-all;">${escapeHtml(
            verifyUrl,
          )}</a>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Verify your email</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600"
                 style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 24px 8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                <div style="font-size:14px;color:#6b7280;">${brand}</div>
                <h1 style="margin:8px 0 0;font-size:20px;line-height:28px;color:#111827;">Verify your email</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#374151;font-size:14px;line-height:20px;">
                Use the button below to verify your email. This will open a secure link tied to your verification token.
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  ${button}
                  ${fallbackLink}
                  <tr>
                    <td style="padding: 0 0 8px; color:#111827; font-size:14px; font-weight:600;">
                      Or enter this token:
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 0 16px;">
                      <code style="display:block;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;color:#111827;word-break:break-all;">
                        ${token}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 0 16px; color:#6b7280; font-size:12px; line-height:18px;">
                      This token expires at <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${expiresAtIso}</span>.
                      If you didn’t request this, you can ignore this email.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
