import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (_resend) return _resend
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is required')
  _resend = new Resend(key)
  return _resend
}

// ─── Brevo fallback ───────────────────────────────────────────────────────────

async function sendViaBrevo(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const key = process.env.BREVO_API_KEY
  if (!key) throw new Error('BREVO_API_KEY is required')

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Formsy', email: 'onboarding@resend.com' },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo error ${res.status}: ${err}`)
  }
}

// ─── Main send function (Resend → Brevo fallback) ─────────────────────────────

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'Formsy <onboarding@resend.com>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
    console.log(`[EMAIL] Sent via Resend to ${params.to}`)
  } catch (primaryErr) {
    console.warn('[EMAIL] Resend failed, trying Brevo:', primaryErr)
    try {
      await sendViaBrevo(params)
      console.log(`[EMAIL] Sent via Brevo to ${params.to}`)
    } catch (fallbackErr) {
      console.error('[EMAIL] Both providers failed:', fallbackErr)
      throw fallbackErr
    }
  }
}

// ─── Email template ───────────────────────────────────────────────────────────

export function buildSubmissionEmail(params: {
  projectName: string
  projectId: string
  data: Record<string, unknown>
  submittedAt: Date
}): { subject: string; html: string } {
  const { projectName, projectId, data, submittedAt } = params

  const rows = Object.entries(data)
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E5;color:#6B6B6B;font-weight:500;white-space:nowrap;width:40%">${key}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E5E5E5;color:#0A0A0A;word-break:break-word">${String(value)}</td>
      </tr>`
    )
    .join('')

  const dashboardUrl = `${process.env.FRONTEND_URL ?? 'https://formsy.dev'}/dashboard/projects/${projectId}/submissions`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F7F7F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:40px 0">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E5E5E5;overflow:hidden">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #E5E5E5">
              <span style="font-size:20px;font-weight:600;color:#0A0A0A;letter-spacing:-0.5px">Formsy</span>
              <span style="display:inline-block;margin-left:8px;background:#00D4A4;color:#000;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px">New submission</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#0A0A0A">You got a new submission</p>
              <p style="margin:0 0 24px;font-size:14px;color:#6B6B6B">Form: <strong style="color:#0A0A0A">${projectName}</strong> &middot; ${submittedAt.toUTCString()}</p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E5E5;border-radius:8px;overflow:hidden;font-size:14px">
                <thead>
                  <tr style="background:#F7F7F7">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6B6B6B;letter-spacing:0.5px;text-transform:uppercase">Field</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6B6B6B;letter-spacing:0.5px;text-transform:uppercase">Value</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <div style="margin-top:24px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#000;color:#fff;font-size:14px;font-weight:500;padding:10px 20px;border-radius:9999px;text-decoration:none">View in dashboard →</a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #E5E5E5;background:#F7F7F7">
              <p style="margin:0;font-size:12px;color:#9B9B9B">You're receiving this because email notifications are enabled for <strong>${projectName}</strong>. <a href="${process.env.FRONTEND_URL}/dashboard/settings" style="color:#6B6B6B">Manage settings</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    subject: `New submission on "${projectName}"`,
    html,
  }
}
