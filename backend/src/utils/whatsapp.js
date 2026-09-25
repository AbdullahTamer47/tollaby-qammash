const crypto = require('crypto');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';

/**
 * Normalize an Egyptian phone number to international format (e.g. 201234567890).
 * Handles common input formats: +20..., 0020..., 01..., 1..., 20...
 */
function normalizeEgyptianPhone(phone) {
  if (!phone) return '';
  // Remove everything except digits and leading +
  let cleaned = String(phone).replace(/[\s\-()]/g, '').replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  // Egyptian mobile: 01x xxxxxxxx → strip leading 0
  if (cleaned.startsWith('0') && cleaned.length === 11) return `20${cleaned.slice(1)}`;
  // Already missing the leading 0: 1x xxxxxxxx (10 digits)
  if (cleaned.startsWith('1') && cleaned.length === 10) return `20${cleaned}`;
  // Already in international form
  if (cleaned.startsWith('20') && cleaned.length === 12) return cleaned;
  // Fallback — return as-is (could be a non-Egyptian number)
  return cleaned;
}

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp API is not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in backend/.env');
  }
  return { token, phoneNumberId };
}

async function sendTextMessage({ to, message }) {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const phoneNumber = normalizeEgyptianPhone(to);
  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'text',
      text: { preview_url: false, body: message }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error?.message || 'WhatsApp API request failed';
    throw new Error(error);
  }

  return { phoneNumber, waMessageId: data.messages?.[0]?.id || null, raw: data };
}

function extractWebhookChanges(body) {
  return body?.entry?.flatMap(entry => entry.changes || []) || [];
}

/**
 * Verify the X-Hub-Signature-256 header sent by Meta webhooks.
 * Returns true if valid or if no app secret is configured (graceful fallback).
 */
function verifyWebhookSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // No secret configured — log a warning but don't block (backwards-compatible)
    console.warn('⚠️  WHATSAPP_APP_SECRET is not set — webhook signature verification is disabled.');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn('⚠️  rawBody is not available on the request — cannot verify webhook signature.');
    return false;
  }

  const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSig);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

module.exports = { extractWebhookChanges, normalizeEgyptianPhone, sendTextMessage, verifyWebhookSignature };
