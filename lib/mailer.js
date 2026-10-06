import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { MINARAA_WHITE_PNG, STARTUPPARK_WHITE_PNG } from './email-logos.js';
import { buildIcs } from './event.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = paise => '₹' + (paise / 100).toLocaleString('en-IN');

// Table layout + inline styles so the pass renders in Gmail, Outlook and Apple Mail.
// Gloock/Poppins are not available in most mail clients, so serif/sans fallbacks are used.
export function passEmailHtml(r) {
  const first = esc(String(r.name).split(/\s+/)[0]);
  const serif = "Georgia,'Times New Roman',serif";
  const sans = "'Poppins','Helvetica Neue',Arial,sans-serif";
  const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
  const k = t => `<div style="font:600 10px ${sans};letter-spacing:2px;color:#D5E2FF;text-transform:uppercase">${t}</div>`;
  const v = t => `<div style="font:600 14px/1.4 ${sans};color:#ffffff;padding-top:2px">${t}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Your pass</title></head>
<body style="margin:0;padding:0;background:#F2EFE9">
<div style="display:none;max-height:0;overflow:hidden">You're in for Sat, 10 Oct · 8:30 AM at iQue Startup Park. Booking ${esc(r.bookingId)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2EFE9"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:0 4px 24px">
    <div style="font:400 34px/1.1 ${serif};color:#0B1430">You're in, <span style="color:#2F5BFF">${first}.</span></div>
    <div style="font:400 15px/1.6 ${sans};color:#5A6078;padding-top:10px">Here's your pass for <b style="color:#0B1430">Founders, Reset Your Energy</b>. Show the QR code at the door. Bring swimwear, a towel and a change of clothes.</div>
  </td></tr>
  <tr><td style="background:#2F5BFF;border-radius:20px 20px 0 0;padding:24px 26px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:600 11px ${sans};letter-spacing:3px;color:#ffffff">WELLNESS SESSION</td>
      <td align="right" style="white-space:nowrap"><img src="cid:sp-logo" alt="Startup Park" height="24" style="height:24px;vertical-align:middle;border:0"><span style="color:#D5E2FF;font:500 13px ${sans};padding:0 8px;vertical-align:middle">×</span><img src="cid:mn-logo" alt="MINARAA" height="30" style="height:30px;vertical-align:middle;border:0"></td>
    </tr></table>
    <div style="font:400 30px/1.1 ${serif};color:#ffffff;padding:20px 0 18px">Founders, <span style="color:#BFE0FF">reset your energy</span></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td width="50%" style="padding-bottom:14px">${k('Date')}${v('Sat, 10 Oct 2026')}</td><td width="50%" style="padding-bottom:14px">${k('Time')}${v('8:30 AM onwards')}</td></tr>
      <tr><td>${k('Name')}${v(esc(r.name))}</td><td>${k('Passes')}${v(`${esc(r.qty)} · ${inr(r.amount)}`)}</td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="background:#FBFAF7;border-radius:0 0 20px 20px;border-top:2px dashed #C9CEDD;padding:24px">
    <img src="cid:pass-qr" alt="QR code for booking ${esc(r.bookingId)}" width="160" height="160" style="display:block;width:160px;height:160px;border:0">
    <div style="font:700 14px ${mono};letter-spacing:1px;color:#0B1430;padding-top:12px">${esc(r.bookingId)}</div>
  </td></tr>
  <tr><td style="padding:24px 4px 0;font:400 14px/1.7 ${sans};color:#5A6078">
    <b style="color:#0B1430">Venue:</b> iQue Startup Park, Hosur Road, near Madiwala, Bengaluru · <a href="https://www.google.com/maps/search/?api=1&query=Startup+Park+Hosur+Road+Madiwala+Bengaluru" style="color:#2F5BFF">Get directions</a><br>
    The attached <b>.ics</b> file adds the session to your calendar.<br>
    Payment ID ${esc(r.paymentId)} · ${inr(r.amount)} incl. GST
  </td></tr>
  <tr><td style="padding:28px 4px 0;font:400 12px/1.6 ${sans};color:#8C90A0">Hosted by MINARAA at Startup Park by iQue. Reply to this email if you have any questions.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function passEmailText(r) {
  return [
    `You're in, ${String(r.name).split(/\s+/)[0]}.`,
    '',
    'Founders, Reset Your Energy — MINARAA × Startup Park',
    'Saturday, 10 October 2026 · 8:30 AM onwards',
    'iQue Startup Park, Hosur Road, near Madiwala, Bengaluru',
    '',
    `Booking ID: ${r.bookingId}`,
    `Name: ${r.name}`,
    `Passes: ${r.qty} · ${inr(r.amount)} incl. GST`,
    `Payment ID: ${r.paymentId}`,
    '',
    'Show the QR code (attached) at the door. Bring swimwear, a towel and a change of clothes.',
  ].join('\n');
}

export function createMailer({ host, port, user, pass, from, replyTo, transport, log = console }) {
  const configured = Boolean(transport || (host && from));
  const tx = transport || (configured
    ? nodemailer.createTransport({ host, port: Number(port) || 587, secure: Number(port) === 465, auth: user ? { user, pass } : undefined })
    : null);

  return {
    configured,
    async sendPass(r) {
      if (!configured) return false;
      const qr = await QRCode.toBuffer(r.bookingId, { type: 'png', width: 480, margin: 1, color: { dark: '#0B1430', light: '#FBFAF7' } });
      await tx.sendMail({
        from,
        replyTo: replyTo || undefined,
        to: `"${String(r.name).replace(/["\r\n]/g, '')}" <${r.email}>`,
        subject: `Your pass · Founders, Reset Your Energy · ${r.bookingId}`,
        text: passEmailText(r),
        html: passEmailHtml(r),
        attachments: [
          { filename: 'pass-qr.png', content: qr, cid: 'pass-qr' },
          { filename: 'startuppark.png', content: STARTUPPARK_WHITE_PNG, cid: 'sp-logo' },
          { filename: 'minaraa.png', content: MINARAA_WHITE_PNG, cid: 'mn-logo' },
          { filename: 'founders-reset-your-energy.ics', content: buildIcs(r.bookingId), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' },
        ],
      });
      log.info?.(`pass emailed ${r.bookingId} → ${r.email}`);
      return true;
    },
  };
}
