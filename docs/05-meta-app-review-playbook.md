# Meta App Review Playbook

## Purpose

This playbook exists to reduce review rejections. Meta reviewers need to see exact permission usage, not a product pitch.

## Preferred API Path

Use Instagram API with Instagram Login for 2026-first development.

Requested scopes:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

Use Facebook Login only if the account or selected Meta product flow blocks an Instagram Login requirement.

## Development Setup

1. Create a Meta developer account at `developers.facebook.com`.
2. Create a Business app.
3. Add the Instagram product.
4. Configure Instagram API with Instagram Login.
5. Do not use `https://<worker-subdomain>.workers.dev/auth/instagram/callback` as a redirect URI for this template. The route is not implemented.
6. For single-account development, generate an Instagram user access token in the App Dashboard for the connected Business or Creator test account.
7. Resolve the connected account ID with a private terminal or Meta API tool:

```bash
read -r -s IG_ACCESS_TOKEN
curl -H "Authorization: Bearer ${IG_ACCESS_TOKEN}" \
  "https://graph.instagram.com/v25.0/me?fields=user_id,username"
unset IG_ACCESS_TOKEN
```

8. Store the token in Cloudflare secret `INSTAGRAM_ACCESS_TOKEN` and the returned `user_id` in `INSTAGRAM_ACCOUNT_ID`.
9. Configure webhook callback:
   - `https://<worker-subdomain>.workers.dev/webhooks/meta`
10. Set webhook verify token to the same value stored in `META_VERIFY_TOKEN`.
11. Subscribe to comments and messaging-related webhook fields required by the selected Meta product.
12. Add the operator account and test account as app roles or testers.
13. Keep `AUTOMATION_ENABLED=false` until the Worker URL, webhook challenge, admin login, and one disabled/draft campaign are verified.
14. Set `AUTOMATION_ENABLED=true` only for the controlled tester flow.

## Pre-Review Build Requirements

The app must show all requested permissions in use:

- For `instagram_business_basic`: load the connected IG professional account ID and username.
- For `instagram_business_manage_comments`: receive or read a comment event and match a keyword.
- For `instagram_business_manage_messages`: send and receive a DM interaction.

## Screencast Script

Record one continuous video with these scenes:

1. Open `/admin-ui` and log in with placeholder-safe test credentials.
2. Show a campaign configured for:
   - media ID.
   - keyword `PROMPT`.
   - opening text.
   - button title.
   - final delivery text.
3. Open Instagram test post.
4. From a test Instagram account, comment `PROMPT`.
5. Show backend log receiving the comment webhook.
6. Show the app matching the keyword.
7. Show Instagram DM receiving the opening message.
8. Tap the button.
9. Show backend log receiving the messaging webhook.
10. Show final prompt or link delivered in Instagram DM.
11. Show admin delivery record with status `sent`.

Keep secrets hidden during the screencast.

## Reviewer Explanation

Use this concise explanation:

```text
Our app helps the owner of an Instagram Business or Creator account send an automated response when someone comments a configured keyword on the owner's own post. We use comment access to detect the keyword and messaging access to send a user-initiated DM flow. The recipient must first interact with the account through a comment and then tap a button in DM before receiving the final prompt or link. We do not scrape Instagram, do not cold-DM users, and do not request Instagram passwords.
```

## Common Rejection Causes

- Screencast does not show a real message being sent.
- Screencast does not show a real comment being processed.
- Reviewer cannot access the test account or app screen.
- App requests messaging permission but only shows analytics or content publishing.
- Privacy Policy URL is missing or blocked.
- Webhook endpoint times out.
- The app uses one permission name in explanation and another in code.
- The app is still using an old Facebook Page login path without explaining why.

## Review Checklist

- [ ] Privacy Policy URL works without login.
- [ ] Terms URL works without login.
- [ ] Data deletion URL works without login.
- [ ] App domain matches callback URLs.
- [ ] Webhook `GET` verification passes.
- [ ] Webhook `POST` signature verification passes.
- [ ] Test Instagram account has a role or tester connection.
- [ ] Comment-to-DM flow works end-to-end before recording.
- [ ] Screencast hides secrets.
- [ ] Screencast shows each requested permission being used.
- [ ] App Review notes include exact test steps.

## Fallback Plan

If Meta rejects the messaging permission:

1. Read the rejection reason literally.
2. Update screencast to show the missing action.
3. Add a minimal visible admin page if reviewer cannot verify backend-only behavior.
4. Resubmit with a shorter explanation and exact timestamps in the video.
5. Keep the product scope narrow: one account, user-initiated comment trigger, explicit DM button tap.
