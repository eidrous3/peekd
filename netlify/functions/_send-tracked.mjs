import {
  getValidAccessToken,
  sendGmailMessage,
} from './_gmail.mjs';
import {
  createTrackedSend,
  createTrackedLinksForSend,
  injectTrackingPixels,
  updateTrackedSendGmailIds,
  wrapLinksInHtml,
} from './_tracking.mjs';
import { dbRequest } from './_support.mjs';

/**
 * Create tracking records (optional), inject pixel/links, send via Gmail.
 * Shared by gmail-send HTTP handler and campaign cron publisher.
 */
export async function sendTrackedEmail({
  userId,
  accessToken,
  fromEmail,
  to,
  subject,
  html,
  attachments = [],
  track = true,
  trackLinks = false,
  addBranding = false,
  campaignId = null,
  campaignStepId = null,
}) {
  const recipients = Array.isArray(to) ? to : [];
  if (!userId || !accessToken || !fromEmail || !recipients.length || !subject) {
    return { ok: false, error: 'invalid_send' };
  }

  let tracked = null;
  if (track) {
    tracked = await createTrackedSend({
      userId,
      fromEmail,
      subject,
      to: recipients,
      campaignId,
      campaignStepId,
    });
    if (!tracked.ok) {
      return { ok: false, error: tracked.error || 'tracking_setup_failed' };
    }
  }

  let finalHtml = html || '<p></p>';
  if (track && tracked?.pixelUrls?.length) {
    finalHtml = injectTrackingPixels(finalHtml, tracked.pixelUrls);
  }
  if (track && trackLinks && tracked?.trackedEmailId) {
    const links = await createTrackedLinksForSend(tracked.trackedEmailId, finalHtml);
    if (links.ok) {
      if (links.preparedHtml) finalHtml = links.preparedHtml;
      if (links.urlToTrackingHref?.size) {
        finalHtml = wrapLinksInHtml(finalHtml, links.urlToTrackingHref);
      }
    } else {
      console.error('[send-tracked] link tracking setup failed:', links.error);
    }
  }
  if (addBranding) {
    finalHtml += '<p style="margin-top:24px;font-size:11px;color:#94a3b8;">Tracked by Peekd</p>';
  }

  const sent = await sendGmailMessage(accessToken, {
    from: fromEmail,
    to: recipients,
    subject,
    html: finalHtml,
    attachments,
  });

  if (!sent.ok) {
    if (tracked?.trackedEmailId) {
      await dbRequest(`tracked_emails?id=eq.${encodeURIComponent(tracked.trackedEmailId)}`, {
        method: 'DELETE',
      });
    }
    return { ok: false, error: sent.error || 'send_failed' };
  }

  if (track && tracked?.trackedEmailId) {
    const patch = await updateTrackedSendGmailIds(tracked.trackedEmailId, {
      gmailMessageId: sent.messageId,
      gmailThreadId: sent.threadId,
    });
    if (!patch.ok) {
      console.error('[send-tracked] tracking patch failed:', patch.error);
    }
  }

  return {
    ok: true,
    messageId: sent.messageId,
    threadId: sent.threadId,
    trackedEmailId: tracked?.trackedEmailId || null,
  };
}

/** Resolve a usable Gmail access token for the user's from-address. */
export async function resolveGmailAccessToken(userId, fromEmail, getConnectedAccounts) {
  const accounts = await getConnectedAccounts(userId, { email: fromEmail });
  const account = accounts[0];
  if (!account) return { ok: false, error: 'no_gmail_account' };
  const accessToken = await getValidAccessToken(account);
  if (!accessToken) return { ok: false, error: 'token_refresh_failed' };
  return { ok: true, accessToken, account };
}
