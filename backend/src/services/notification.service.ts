import { env } from '../config/env';
import { logger } from '../lib/logger';

export type NotificationType = 'QUOTE' | 'CONTACT' | 'APPLICATION';

export interface AdminNotification {
  type: NotificationType;
  reference: string;
  subject: string;
  summary: string;
  contactEmail: string;
}

/**
 * Notifies the operations team about a new submission.
 *
 * The channel is intentionally provider-agnostic:
 *  - always writes a structured log line (picked up by the container logs),
 *  - optionally POSTs to NOTIFY_WEBHOOK_URL (Slack/Teams/n8n/Zapier/SMTP relay).
 * Swapping in a transactional email provider only requires implementing this
 * function - no call-site changes.
 */
export async function notifyAdmin(notification: AdminNotification): Promise<void> {
  logger.info('admin_notification', { ...notification });

  if (!env.NOTIFY_WEBHOOK_URL) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...notification,
        site: env.PUBLIC_SITE_URL,
        receivedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (error) {
    logger.warn('Admin webhook notification failed', { message: (error as Error).message });
  }
}
