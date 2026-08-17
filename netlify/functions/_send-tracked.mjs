import { resolveSendAccount, sendProviderMessage } from './_providers.mjs';
import {
  createTrackedSend,
  createTrackedLinksForSend,
  injectTrackingPixels,
  stripTrackingPixels,
  updateTrackedSendGmailIds,
  wrapLinksInHtml,
} from './_tracking.mjs';
import { dbRequest } from './_support.mjs';
import {
  appendUnsubscribeFooter,
  campaignAllowsUnsubscribe,
  signUnsubscribeToken,
  unsubscribeUrl,
} from './_unsubscribe.mjs';

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
  senderIp = null,
  provider = 'gmail',
  // Pass the campaign's flag when the caller already has it to save a lookup;
  // leave it null and it's read from the campaign row.
  unsubscribeEnabled = null,
  // Threading: set together to file this send into an existing conversation.
  inReplyTo = null,
  references = null,
  threadId = null,
  replyToMessageId = null,
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
      senderIp,
      provider,
    });
    if (!tracked.ok) {
      return { ok: false, error: tracked.error || 'tracking_setup_failed' };
    }
  }

  // Quoted replies carry the original message's pixel; only this send's own may stay.
  let finalHtml = stripTrackingPixels(html) || '<p></p>';
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
  // Must come after link tracking, otherwise the opt-out URL gets rewritten into
  // a click redirect. Campaign sends are one recipient per call, which is what
  // makes a per-recipient link possible.
  if (campaignId && recipients.length === 1) {
    const allowed = unsubscribeEnabled === null
      ? await campaignAllowsUnsubscribe(campaignId)
      : unsubscribeEnabled === true;
    if (allowed) {
      const token = signUnsubscribeToken({ campaignId, email: recipients[0] });
      if (token) finalHtml = appendUnsubscribeFooter(finalHtml, unsubscribeUrl(token));
    }
  }

  if (addBranding) {
    finalHtml += '<p style="margin-top:24px;font-size:11px;color:#94a3b8;"><a href="https://www.getpeekd.com" style="color:#94a3b8;text-decoration:underline;">Tracked by Peekd</a></p>';
  }

  const sent = await sendProviderMessage(provider, accessToken, {
    from: fromEmail,
    to: recipients,
    subject,
    html: finalHtml,
    attachments,
    inReplyTo,
    references,
    threadId,
    replyToMessageId,
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

/** Resolve a usable access token for the user's from-address on any provider. */
export async function resolveSendCredentials(userId, fromEmail) {
  const res = await resolveSendAccount(userId, fromEmail);
  if (!res.ok) {
    return { ok: false, error: res.error === 'no_connected_account' ? 'no_sending_account' : res.error };
  }
  return res;
}
