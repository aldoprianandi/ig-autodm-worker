export function adminUiPage(nonce: string, turnstileSiteKey?: string): string {
  const escapedTurnstileSiteKey = escapeHtmlAttr(turnstileSiteKey || "");
  const turnstileEnabled = Boolean(escapedTurnstileSiteKey);
  const turnstileScript = turnstileEnabled
    ? `<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : "";
  const turnstileMarkup = turnstileEnabled
    ? `<div class="turnstile-wrap">
              <div class="cf-turnstile" data-sitekey="${escapedTurnstileSiteKey}" data-action="admin-login" data-theme="light"></div>
              <span class="help">Additional security verification provided by Cloudflare.</span>
            </div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f4f1ea">
    <link rel="icon" href="data:,">
    ${turnstileEnabled ? `<link rel="preconnect" href="https://challenges.cloudflare.com">` : ""}
    <title>IG AutoDM Worker</title>
    <style nonce="${nonce}">
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --surface: #fffdf8;
        --surface-2: #f9f6ef;
        --ink: #171614;
        --soft-ink: #4b4944;
        --muted: #77736b;
        --line: #ded7cb;
        --line-strong: #c8bfb0;
        --accent: #0f6a43;
        --accent-ink: #073d27;
        --accent-soft: #e5f3ea;
        --danger: #b42318;
        --danger-soft: #fff0ee;
        --warn: #8a5a00;
        --warn-soft: #fff4d8;
        --mono: "JetBrains Mono", "SFMono-Regular", "Cascadia Mono", Consolas, monospace;
        --sans: "Aptos", "Geist", "Satoshi", "Helvetica Neue", Arial, sans-serif;
        --ease: cubic-bezier(0.16, 1, 0.3, 1);
      }

      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html { background: var(--bg); }
      body {
        margin: 0;
        min-height: 100dvh;
        background:
          linear-gradient(90deg, rgba(23, 22, 20, 0.035) 1px, transparent 1px),
          linear-gradient(180deg, rgba(23, 22, 20, 0.035) 1px, transparent 1px),
          radial-gradient(circle at 20% 8%, rgba(15, 106, 67, 0.10), transparent 32rem),
          var(--bg);
        background-size: 36px 36px, 36px 36px, auto, auto;
        color: var(--ink);
        font-family: var(--sans);
        font-size: 14px;
        line-height: 1.45;
      }
      body::before {
        content: "";
        display: none;
      }
      button, input, textarea { font: inherit; }
      a, button, summary, input, textarea { touch-action: manipulation; }
      a, button, summary { -webkit-tap-highlight-color: transparent; }
      button {
        align-items: center;
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--ink);
        cursor: pointer;
        display: inline-flex;
        font-weight: 720;
        gap: 8px;
        justify-content: center;
        min-height: 40px;
        outline: 2px solid transparent;
        outline-offset: 2px;
        padding: 0 14px;
        transition: transform 180ms var(--ease), border-color 180ms var(--ease), background 180ms var(--ease), color 180ms var(--ease);
      }
      button:hover { border-color: var(--line-strong); }
      button:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(15, 106, 67, 0.14);
      }
      button:active { transform: translateY(1px) scale(0.99); }
      button:disabled { cursor: not-allowed; opacity: 0.52; }
      button.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #fffdf8;
      }
      button.secondary {
        background: var(--accent-soft);
        border-color: #b8dcc4;
        color: var(--accent-ink);
      }
      button.ghost { background: transparent; }
      button.danger { color: var(--danger); }
      button.full { width: 100%; }
      .action-hidden { display: none !important; }
      input, textarea {
        width: 100%;
        border: 1px solid var(--line);
        background: #fffefa;
        color: var(--ink);
        outline: 2px solid transparent;
        outline-offset: 2px;
        padding: 11px 12px;
        transition: border-color 180ms var(--ease), box-shadow 180ms var(--ease), background 180ms var(--ease);
      }
      input:focus-visible, textarea:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(15, 106, 67, 0.14);
      }
      textarea { min-height: 110px; resize: vertical; }
      label { color: var(--soft-ink); display: grid; font-weight: 740; gap: 7px; }
      .help { color: var(--muted); display: block; font-size: 12px; font-weight: 560; }
      .shell { min-height: 100dvh; position: relative; }
      .boot-screen {
        align-items: center;
        display: grid;
        min-height: 100dvh;
        padding: 28px;
        place-items: center;
      }
      .checking-card {
        background: var(--surface);
        border: 1px solid var(--line);
        display: grid;
        gap: 10px;
        max-width: 420px;
        padding: 24px;
        width: 100%;
      }
      .checking-card strong { font-size: 20px; letter-spacing: -0.035em; }
      .checking-card p { color: var(--muted); margin: 0; }

      .lock-screen {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
        min-height: 100dvh;
      }
      .lock-copy {
        align-content: end;
        display: grid;
        gap: 24px;
        padding: 64px clamp(28px, 6vw, 84px);
      }
      .eyebrow {
        color: var(--accent-ink);
        font-family: var(--mono);
        font-size: 12px;
        font-weight: 760;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .lock-copy h1 {
        font-size: clamp(46px, 9vw, 112px);
        letter-spacing: -0.055em;
        line-height: 0.88;
        margin: 0;
        max-width: 820px;
        text-wrap: balance;
      }
      .lock-copy p {
        color: var(--soft-ink);
        font-size: clamp(16px, 2.2vw, 21px);
        margin: 0;
        max-width: 610px;
      }
      .proof-grid {
        border-bottom: 1px solid var(--line);
        border-top: 1px solid var(--line);
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        max-width: 720px;
      }
      .proof {
        display: grid;
        gap: 7px;
        min-height: 104px;
        padding: 20px;
      }
      .proof + .proof { border-left: 1px solid var(--line); }
      .proof strong { font-size: 24px; letter-spacing: -0.04em; }
      .proof span { color: var(--muted); font-size: 12px; }

      .login-wrap {
        align-items: center;
        display: grid;
        padding: clamp(22px, 4vw, 48px);
      }
      .login-panel {
        background: rgba(255, 253, 248, 0.88);
        border: 1px solid rgba(222, 215, 203, 0.9);
        box-shadow: 0 24px 70px rgba(41, 34, 23, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72);
        display: grid;
        gap: 22px;
        padding: clamp(24px, 4vw, 40px);
      }
      .turnstile-wrap {
        border: 1px solid var(--line);
        background: #fffefa;
        display: grid;
        gap: 8px;
        justify-items: start;
        padding: 12px;
      }
      .login-head { display: grid; gap: 8px; }
      .login-head h2 {
        font-size: clamp(24px, 4vw, 38px);
        letter-spacing: -0.04em;
        line-height: 1;
        margin: 0;
      }
      .login-head p { color: var(--muted); margin: 0; }
      .remember {
        align-items: center;
        display: flex;
        gap: 9px;
        font-weight: 680;
      }
      .remember input { height: 18px; width: 18px; }

      .workspace {
        display: grid;
        gap: 0;
        min-height: 100dvh;
      }
      .app-header {
        align-items: center;
        background: rgba(255, 253, 248, 0.86);
        border-bottom: 1px solid var(--line);
        display: flex;
        gap: 18px;
        justify-content: space-between;
        padding: 16px clamp(18px, 4vw, 48px);
        position: sticky;
        top: 0;
        z-index: 20;
      }
      .brand-block {
        display: grid;
        gap: 4px;
      }
      .brand-block strong {
        font-size: 20px;
        letter-spacing: -0.045em;
      }
      .brand-block span { color: var(--muted); font-size: 13px; }
      .campaign-switcher {
        display: grid;
        gap: 16px;
        grid-area: list;
        padding: 16px 18px;
        position: sticky;
        top: 82px;
      }
      .section-head {
        align-items: end;
        display: flex;
        gap: 16px;
        justify-content: space-between;
      }
      .section-head h3 {
        font-size: 17px;
        letter-spacing: -0.03em;
        margin: 0;
      }
      .section-head p {
        color: var(--muted);
        margin: 4px 0 0;
      }
      .campaign-list {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr;
        max-height: calc(100dvh - 240px);
        overflow: auto;
      }
      .campaign-row {
        background: transparent;
        border: 1px solid var(--line);
        display: grid;
        gap: 8px;
        justify-content: stretch;
        min-height: auto;
        padding: 12px;
        text-align: left;
      }
      .campaign-row:hover { background: rgba(255, 253, 248, 0.72); border-color: var(--line); }
      .campaign-row.active {
        background: var(--surface);
        border-color: var(--line-strong);
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .campaign-row strong { overflow-wrap: anywhere; }
      .campaign-row small { color: var(--muted); font-family: var(--mono); font-size: 11px; overflow-wrap: anywhere; }

      .content {
        display: grid;
        gap: 18px;
        margin: 0 auto;
        max-width: 1680px;
        padding: 18px clamp(18px, 4vw, 48px) 48px;
        width: 100%;
        grid-template-columns: minmax(250px, 300px) minmax(0, 1fr) minmax(320px, 380px);
        grid-template-areas:
          "hero hero hero"
          "status status status"
          "list guide preview"
          "list editor preview"
          "list system system";
        align-items: start;
      }
      .hero-row {
        align-items: end;
        background: rgba(255, 253, 248, 0.82);
        border: 1px solid var(--line);
        display: grid;
        gap: 20px;
        grid-area: hero;
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 16px 18px;
      }
      .hero-row h1 {
        font-size: 28px;
        letter-spacing: -0.045em;
        line-height: 1;
        margin: 0;
        text-wrap: balance;
      }
      .hero-row p { color: var(--muted); margin: 8px 0 0; }
      .top-actions { display: flex; flex-wrap: wrap; gap: 10px; }

      .summary-rail {
        border: 1px solid var(--line);
        display: grid;
        grid-template-columns: repeat(5, minmax(86px, 1fr));
        min-width: min(640px, 100%);
      }
      .status-strip {
        align-items: center;
        background: rgba(255, 253, 248, 0.82);
        border: 1px solid var(--line);
        display: flex;
        flex-wrap: wrap;
        gap: 0;
        grid-area: status;
      }
      .status-strip span {
        color: var(--soft-ink);
        min-height: 38px;
        padding: 10px 14px;
      }
      .status-strip span + span { border-left: 1px solid var(--line); }
      .status-strip strong { color: var(--ink); }
      .quick-guide {
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--line);
        display: grid;
        gap: 16px;
        grid-area: guide;
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 16px 18px;
      }
      .quick-guide h3 {
        font-size: 18px;
        letter-spacing: -0.03em;
        margin: 0 0 4px;
      }
      .guide-steps {
        color: var(--soft-ink);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .guide-steps span {
        background: var(--surface-2);
        border: 1px solid var(--line);
        padding: 7px 9px;
      }
      .metric {
        display: grid;
        gap: 4px;
        padding: 12px 14px;
      }
      .metric + .metric { border-left: 1px solid var(--line); }
      .metric span { color: var(--muted); font-size: 12px; font-weight: 760; text-transform: uppercase; }
      .metric strong {
        font-family: var(--mono);
        font-size: 23px;
        font-weight: 760;
        letter-spacing: -0.06em;
      }
      .metric.warn {
        background: var(--danger-soft);
        color: var(--danger);
      }
      .metric.warn span { color: var(--danger); }

      .work-grid {
        display: contents;
      }
      .work-grid > .surface:first-child { grid-area: editor; }
      .surface {
        background: rgba(255, 253, 248, 0.82);
        border: 1px solid var(--line);
      }
      .surface-head {
        align-items: center;
        border-bottom: 1px solid var(--line);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 16px 18px;
      }
      .surface-head h3 { font-size: 15px; margin: 0; }
      .surface-head.editor-head {
        background: rgba(255, 253, 248, 0.96);
        position: sticky;
        top: 73px;
        z-index: 12;
      }
      .editor-title-block {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .editor-head-actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }
      .editor-head-actions button { min-width: 108px; }
      .surface-body { padding: 20px; }
      .form-grid {
        display: grid;
        gap: 18px;
        max-width: 860px;
      }
      .wizard-steps {
        counter-reset: steps;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .wizard-steps li {
        background: var(--surface-2);
        border: 1px solid var(--line);
        color: var(--soft-ink);
        display: grid;
        gap: 3px;
        min-height: 70px;
        padding: 10px;
      }
      .wizard-steps li::before {
        color: var(--accent-ink);
        content: counter(steps, decimal-leading-zero);
        counter-increment: steps;
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 780;
      }
      .wizard-steps strong { color: var(--ink); font-size: 13px; }
      .plain-guide {
        background: var(--accent-soft);
        border: 1px solid #b8dcc4;
        color: var(--accent-ink);
        font-weight: 720;
        padding: 12px;
      }
      .form-section {
        border: 1px solid var(--line);
        display: grid;
        gap: 14px;
        padding: 14px;
      }
      .form-section:focus-within {
        border-color: var(--line-strong);
        background: rgba(255, 253, 248, 0.62);
      }
      .form-section-head { display: grid; gap: 4px; }
      .form-section-head h4 {
        font-size: 16px;
        letter-spacing: -0.025em;
        margin: 0;
      }
      .form-section-head p { color: var(--muted); margin: 0; }
      .field-row { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
      .creation-grid { display: block; }
      .post-picker {
        display: grid;
        gap: 14px;
        padding: 14px;
      }
      .post-picker-panel {
        background: #fffefa;
        border: 1px solid var(--line);
      }
      .post-picker-panel summary {
        align-items: center;
        cursor: pointer;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        list-style: none;
        padding: 14px;
      }
      .post-picker-panel summary::-webkit-details-marker { display: none; }
      .post-picker-panel summary strong { display: block; }
      .post-picker-panel summary small {
        color: var(--muted);
        display: block;
        font-family: var(--mono);
        font-size: 11px;
        margin-top: 3px;
        overflow-wrap: anywhere;
      }
      .summary-action {
        color: var(--accent-ink);
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .post-list {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        max-height: 320px;
        overflow: auto;
      }
      .post-row {
        background: transparent;
        border: 1px solid var(--line);
        display: grid;
        gap: 8px;
        justify-content: stretch;
        min-height: auto;
        padding: 12px;
        text-align: left;
      }
      .post-row:hover { background: rgba(255, 253, 248, 0.74); border-color: var(--line-strong); }
      .post-row.active {
        background: var(--surface);
        border-color: var(--accent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
      .post-row strong { overflow-wrap: anywhere; }
      .post-row small { color: var(--muted); font-family: var(--mono); font-size: 11px; overflow-wrap: anywhere; }
      .post-actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: space-between;
      }
      .post-link {
        color: var(--accent-ink);
        font-size: 12px;
        font-weight: 760;
        text-decoration: none;
      }
      .post-link:hover { text-decoration: underline; }
      .post-meta {
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 12px;
      }
      .editor-pane { padding: 18px; }
      .mode-note {
        background: var(--surface-2);
        border: 1px solid var(--line);
        color: var(--soft-ink);
        display: grid;
        gap: 6px;
        padding: 12px;
      }
      .mode-note strong { color: var(--ink); }
      .advanced-panel {
        border: 1px solid var(--line);
        background: #fffefa;
      }
      .advanced-panel summary {
        cursor: pointer;
        font-weight: 780;
        padding: 12px;
      }
      .advanced-panel .advanced-body {
        border-top: 1px solid var(--line);
        display: grid;
        gap: 14px;
        padding: 12px;
      }
      .variant-library {
        border: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.72);
        display: grid;
        gap: 12px;
        padding: 12px;
      }
      .variant-library-head {
        align-items: end;
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(0, 1fr) minmax(200px, 0.55fr);
      }
      .variant-library-head strong { display: block; }
      .template-panel {
        border: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.72);
      }
      .template-panel > summary {
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        list-style: none;
        padding: 12px;
      }
      .template-panel > summary::-webkit-details-marker { display: none; }
      .template-panel > summary strong { display: block; }
      .template-panel > summary span {
        color: var(--muted);
        display: block;
        font-size: 12px;
        margin-top: 2px;
      }
      .template-panel .variant-library {
        border: 0;
        border-top: 1px solid var(--line);
      }
      .template-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-height: 126px;
        overflow: auto;
      }
      .template-chip {
        background: #fffefa;
        border: 1px solid var(--line);
        color: var(--soft-ink);
        min-height: 32px;
        max-width: 100%;
      }
      .template-chip.active {
        background: var(--accent-soft);
        border-color: #b8dcc4;
        color: var(--accent-ink);
      }
      .template-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .dm-step-panel > summary strong { color: var(--ink); }
      .dm-step-editor {
        border-top: 1px solid var(--line);
        display: grid;
        gap: 12px;
        padding: 12px;
      }
      .dm-step-list {
        display: grid;
        gap: 10px;
      }
      .dm-step-row {
        background: rgba(255, 253, 248, 0.78);
        border: 1px solid var(--line);
        display: grid;
        gap: 10px;
        padding: 12px;
      }
      .dm-step-row-head {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }
      .dm-step-row-head strong {
        color: var(--accent-ink);
        font-family: var(--mono);
        font-size: 12px;
        text-transform: uppercase;
      }
      .dm-step-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(0, 1fr) minmax(150px, 220px);
      }
      .dm-step-variants { grid-column: 1 / -1; }
      .dm-step-actions {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }
      .field-error {
        color: var(--danger);
        display: none;
        font-size: 12px;
        font-weight: 680;
      }
      .field-error.show { display: block; }
      .live-control {
        background: var(--warn-soft);
        border: 1px solid #efd18b;
        display: grid;
        gap: 8px;
        padding: 12px;
      }
      .option-card {
        background: var(--surface-2);
        border: 1px solid var(--line);
        display: grid;
        gap: 8px;
        padding: 12px;
      }
      .option-card.active {
        background: var(--accent-soft);
        border-color: #b8dcc4;
      }
      .activation-card {
        background: var(--surface-2);
        border: 1px solid var(--line);
        display: grid;
        gap: 8px;
        padding: 14px;
      }
      .activation-card.live {
        background: var(--accent-soft);
        border-color: #b8dcc4;
      }
      .activation-card.draft {
        background: var(--warn-soft);
        border-color: #efd18b;
      }
      .activation-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .activation-actions button { min-width: 120px; }
      input[readonly] {
        background: #f3eee5;
        color: var(--muted);
      }
      .checks { align-items: center; display: flex; flex-wrap: wrap; gap: 16px; }
      .check { align-items: center; display: inline-flex; gap: 9px; font-weight: 740; }
      .check input { height: 18px; width: 18px; }
      .editor-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }

      .preview-panel {
        grid-area: preview;
        position: sticky;
        top: 82px;
        max-height: calc(100dvh - 98px);
        overflow: auto;
      }
      .preview-body {
        display: grid;
        gap: 14px;
        padding: 16px;
      }
      .readiness-list {
        background: #fffefa;
        border: 1px solid var(--line);
        color: var(--soft-ink);
        display: grid;
        gap: 8px;
        padding: 12px;
      }
      .readiness-list strong { color: var(--ink); }
      .readiness-item {
        align-items: center;
        background: transparent;
        border: 0;
        cursor: pointer;
        display: flex;
        font-weight: inherit;
        gap: 8px;
        justify-content: space-between;
        min-height: auto;
        padding: 0;
        text-align: left;
        width: 100%;
      }
      .readiness-item:active { transform: none; }
      .readiness-item:focus-visible {
        box-shadow: none;
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .readiness-item span:last-child {
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 780;
      }
      .readiness-item.ok span:last-child { color: var(--accent-ink); }
      .readiness-item.missing span:last-child { color: var(--warn); }
      .ig-preview-block {
        background: #0f1014;
        border: 1px solid #252833;
        color: #f4f5f7;
        display: grid;
        gap: 12px;
        padding: 14px;
      }
      .ig-preview-block h4 {
        color: #f7f7f8;
        font-size: 13px;
        margin: 0;
      }
      .preview-muted {
        color: #a8abb5;
        font-size: 12px;
      }
      .comment-preview {
        display: grid;
        gap: 12px;
      }
      .comment-line {
        display: grid;
        gap: 10px;
        grid-template-columns: 34px minmax(0, 1fr);
      }
      .comment-avatar {
        align-items: center;
        background: linear-gradient(135deg, #315c4a, #0f6a43);
        border: 2px solid #30343d;
        border-radius: 999px;
        color: #fff;
        display: inline-flex;
        font-weight: 850;
        height: 34px;
        justify-content: center;
        width: 34px;
      }
      .comment-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .comment-copy strong {
        color: #f8f8fa;
        font-size: 13px;
      }
      .comment-copy span {
        color: #e8e9ee;
        overflow-wrap: anywhere;
      }
      .comment-reply {
        border-left: 2px solid #30343d;
        margin-left: 16px;
        padding-left: 14px;
      }
      .dm-phone {
        background: #050507;
        border: 1px solid #2b2d35;
        display: grid;
        gap: 12px;
        min-height: 390px;
        padding: 12px;
      }
      .dm-header {
        align-items: center;
        border-bottom: 1px solid #20222a;
        display: flex;
        gap: 10px;
        padding-bottom: 10px;
      }
      .dm-avatar {
        align-items: center;
        background: #f4f5f7;
        border-radius: 999px;
        color: #101114;
        display: inline-flex;
        font-weight: 900;
        height: 30px;
        justify-content: center;
        width: 30px;
      }
      .dm-thread {
        align-content: start;
        display: grid;
        gap: 12px;
      }
      .dm-card,
      .dm-bubble {
        border-radius: 18px;
        max-width: 92%;
        overflow-wrap: anywhere;
        padding: 12px;
      }
      .dm-card {
        background: #22242b;
        justify-self: start;
      }
      .dm-card.step-card {
        background: #262932;
        border-left: 3px solid #4c856c;
      }
      .dm-card p {
        margin: 0 0 10px;
        white-space: pre-wrap;
      }
      .dm-button-preview {
        background: #323640;
        border-radius: 10px;
        color: #fff;
        font-weight: 850;
        padding: 10px;
        text-align: center;
      }
      .dm-bubble.user {
        background: #5b37ee;
        justify-self: end;
      }
      .dm-bubble.brand {
        background: #22242b;
        justify-self: start;
        white-space: pre-wrap;
      }
      .preview-empty {
        color: #a8abb5;
        font-style: italic;
      }

      .system-panel {
        background: rgba(255, 253, 248, 0.62);
        border: 1px solid var(--line);
        grid-area: system;
      }
      .system-panel > summary {
        align-items: center;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        list-style: none;
        padding: 14px 18px;
      }
      .system-panel > summary::-webkit-details-marker { display: none; }
      .system-body {
        border-top: 1px solid var(--line);
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr 1fr;
        padding: 16px 18px;
      }
      .system-body h3 {
        font-size: 14px;
        margin: 0 0 10px;
      }
      .runtime-list { display: grid; }
      .runtime-item {
        align-items: center;
        border-bottom: 1px solid var(--line);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 13px 0;
      }
      .runtime-item:first-child { padding-top: 0; }
      .runtime-item:last-child { border-bottom: 0; padding-bottom: 0; }
      .runtime-item span:first-child { color: var(--muted); }
      .runtime-item strong { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; text-align: right; }
      .pill {
        align-items: center;
        display: inline-flex;
        font-size: 12px;
        font-weight: 780;
        min-height: 24px;
        padding: 0 9px;
      }
      .pill.ok { background: var(--accent-soft); color: var(--accent-ink); }
      .pill.off { background: #ebe5da; color: var(--soft-ink); }
      .pill.warn { background: var(--warn-soft); color: var(--warn); }
      .pill.bad { background: var(--danger-soft); color: var(--danger); }
      .notice {
        border: 1px solid var(--line);
        display: none;
        padding: 11px 12px;
      }
      .notice.show { display: block; }
      .notice.ok { background: var(--accent-soft); border-color: #b8dcc4; color: var(--accent-ink); }
      .notice.bad { background: var(--danger-soft); border-color: #f2b7b1; color: var(--danger); }
      .empty {
        border: 1px dashed var(--line-strong);
        color: var(--muted);
        padding: 28px;
        text-align: center;
      }
      .fade-in { animation: fadeIn 420ms var(--ease) both; }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 980px) {
        .lock-screen { grid-template-columns: 1fr; }
        .content {
          grid-template-columns: 1fr;
          grid-template-areas:
            "hero"
            "status"
            "guide"
            "list"
            "editor"
            "preview"
            "system";
        }
        .hero-row { align-items: stretch; grid-template-columns: 1fr; }
        .summary-rail { min-width: 0; }
        .campaign-switcher,
        .work-grid > .surface:first-child,
        .preview-panel,
        .system-panel {
          grid-column: 1;
          position: static;
          max-height: none;
        }
        .preview-panel { position: static; }
        .system-body { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .lock-copy, .login-wrap, .content { padding: 18px; }
        .app-header, .section-head { align-items: stretch; flex-direction: column; }
        .proof-grid, .field-row { grid-template-columns: 1fr; }
        .quick-guide { grid-template-columns: 1fr; }
        .wizard-steps { grid-template-columns: 1fr; }
        .summary-rail {
          border: 0;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .summary-rail .metric { border: 1px solid var(--line); }
        .proof + .proof { border-left: 0; border-top: 1px solid var(--line); }
        .app-header .top-actions { display: grid; grid-template-columns: 1fr 1fr; }
        .app-header .top-actions button { width: auto; }
        .editor-actions { justify-content: stretch; }
        .editor-actions button { width: 100%; }
        .dm-step-grid { grid-template-columns: 1fr; }
        .variant-library-head { grid-template-columns: 1fr; }
        .template-actions button { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.001ms !important;
        }
      }
    </style>
  </head>
  <body data-admin-ui>
    <div class="shell">
      <section id="bootScreen" class="boot-screen">
        <div class="checking-card">
          <div class="eyebrow">Internal dashboard</div>
          <strong>Checking access…</strong>
          <p>If your session is still active, the dashboard will open automatically.</p>
        </div>
      </section>

      <section id="lockScreen" class="lock-screen" hidden>
        <div class="lock-copy">
          <div class="eyebrow">Internal dashboard</div>
          <h1>IG AutoDM Worker</h1>
          <p>Manage Instagram Auto-DM campaigns from one secure workspace.</p>
          <div class="proof-grid" aria-label="Security overview">
            <div class="proof"><strong>Private</strong><span>operator access only</span></div>
            <div class="proof"><strong>2 steps</strong><span>operator login + security key</span></div>
            <div class="proof"><strong>30 minutes</strong><span>locks automatically when inactive</span></div>
          </div>
        </div>
        <div class="login-wrap">
          <form id="loginForm" class="login-panel">
            <div class="login-head">
              <div class="eyebrow">Login dashboard</div>
              <h2>Sign in to the dashboard</h2>
              <p>Use your operator account, then verify with the security key.</p>
            </div>
            <div class="field-row">
              <label>
                Username
                <input id="adminUsername" name="username" type="text" autocomplete="username" spellcheck="false" placeholder="admin">
                <span class="help">Your registered operator account.</span>
              </label>
              <label>
                Password
                <input id="adminPassword" name="password" type="password" autocomplete="current-password" spellcheck="false" placeholder="Password">
                <span class="help">Your operator account password.</span>
              </label>
            </div>
            <label>
              Security key
              <input id="adminToken" name="adminToken" type="password" autocomplete="off" spellcheck="false" placeholder="Paste security key">
              <span class="help">An additional access key for opening the dashboard.</span>
            </label>
            ${turnstileMarkup}
            <div id="loginNotice" class="notice" role="alert" aria-live="assertive"></div>
            <button id="connectButton" class="primary" type="submit">Sign in</button>
          </form>
        </div>
      </section>

      <section id="workspace" class="workspace fade-in" hidden>
        <header class="app-header">
          <div class="brand-block">
            <strong>IG AutoDM Worker</strong>
            <span id="connectionState">Connected</span>
          </div>
          <div class="top-actions">
            <button id="refreshButton" type="button">Refresh</button>
            <button id="clearButton" type="button">Lock dashboard</button>
          </div>
        </header>

        <main class="content">
          <section class="hero-row">
            <div>
              <div class="eyebrow">Auto-DM Instagram</div>
              <h1>Campaign Auto-DM</h1>
              <p id="selectedCampaignId">Select a campaign or create a new one. Active campaigns respond to comments that match the trigger.</p>
            </div>
            <div class="summary-rail" aria-label="Dashboard summary">
              <div class="metric"><span>Campaign</span><strong id="campaignCount">-</strong></div>
              <div class="metric"><span>Sent</span><strong id="deliveryCount">-</strong></div>
              <div class="metric"><span>Failed</span><strong id="failedCount">-</strong></div>
              <div class="metric"><span>Retried</span><strong id="retryingCount">-</strong></div>
              <div id="unknownStatusMetric" class="metric"><span>Needs review</span><strong id="unknownStatusCount">-</strong></div>
            </div>
          </section>

          <section class="status-strip" aria-label="Readiness summary">
            <span>Status: <strong id="readinessRuntime">checking</strong></span>
            <span>Active campaigns: <strong id="readinessLive">-</strong></span>
            <span>Instagram connection: <strong id="readinessToken">-</strong></span>
            <span>Error: <strong id="readinessError">none</strong></span>
          </section>

          <section id="quickGuide" class="quick-guide" aria-label="Quick guide">
            <div>
              <h3>Create a new campaign</h3>
              <p class="help">Select a post, enter a trigger, review the preview, save a draft, then activate it.</p>
              <div class="guide-steps">
                <span>1. Select a post</span>
                <span>2. Enter a trigger</span>
                <span>3. Configure the DM flow</span>
                <span>4. Save, then activate</span>
              </div>
            </div>
            <button id="quickStartButton" class="primary" type="button">Start by selecting a post</button>
          </section>

          <section class="surface campaign-switcher" aria-label="Select a campaign">
            <div class="section-head">
              <div>
                <h3>Campaign list</h3>
                <p>Each campaign watches one post, one trigger, and one DM flow.</p>
              </div>
              <button id="newCampaignButtonSide" class="secondary" type="button">Create campaign</button>
            </div>
            <div id="campaignList" class="campaign-list" aria-label="Campaign list">
              <div class="empty">No campaigns loaded yet.</div>
            </div>
          </section>

          <section class="work-grid">
            <div class="surface">
              <div class="surface-head editor-head">
                <div class="editor-title-block">
                  <h3 id="editorTitle">Campaign editor</h3>
                  <span id="editorSubtitle" class="help">Select a campaign or create a new one.</span>
                </div>
                <div class="editor-head-actions">
                  <span id="saveState" class="pill off">ready</span>
                  <button id="saveDraftButton" class="primary" type="button">Save draft</button>
                  <button id="goLiveButton" class="secondary" type="button">Activate campaign</button>
                  <button id="pauseCampaignButton" type="button">Pause campaign</button>
                  <button id="deleteCampaignButton" class="danger" type="button">Delete campaign</button>
                </div>
              </div>
              <div class="surface-body">
                <form id="campaignForm" class="form-grid">
                  <div id="modeNote" class="mode-note">
                    <strong>Select a campaign</strong>
                    <span class="help">Select an existing campaign or create a new one.</span>
                  </div>

                  <div class="plain-guide">Complete the required fields: post, trigger, opening DM, button, and final prompt or link. You can add variants later.</div>

                  <section class="form-section">
                    <div class="form-section-head">
                      <h4>1. Select an Instagram post</h4>
                      <p>This campaign runs only on this post, not on every Instagram post.</p>
                    </div>
                    <details id="postPickerPanel" class="post-picker-panel">
                      <summary>
                        <span>
                          <strong>Monitored post</strong>
                          <small id="selectedPostLabel">No post selected</small>
                        </span>
                        <span class="summary-action">Select post</span>
                      </summary>
                      <div class="post-picker">
                        <div>
                          <div class="eyebrow">Recent posts</div>
                          <p class="help">Select the post this campaign should monitor.</p>
                        </div>
                        <div id="mediaNotice" class="notice" role="status" aria-live="polite"></div>
                        <div id="postList" class="post-list" aria-label="Recent Instagram posts">
                          <div class="empty">Open the post list or click Refresh posts.</div>
                        </div>
                        <button id="reloadMediaButton" class="full" type="button">Refresh posts</button>
                      </div>
                    </details>
                    <span id="mediaIdError" class="field-error"></span>
                  </section>

                  <section class="form-section">
                    <div class="form-section-head">
                      <h4>2. Comment trigger</h4>
                      <p>When a comment contains this word or phrase, the DM flow starts. Matching tolerates letter case, small typos, key words in a phrase, and word order.</p>
                    </div>
                    <div class="field-row">
                      <label>Campaign name<input id="name" name="name" maxlength="80" required placeholder="Example: Blue Green Guide"><span class="help">This name appears only in the dashboard.</span><span id="nameError" class="field-error"></span></label>
                      <label>Trigger word or phrase<input id="keyword" name="keyword" maxlength="80" required placeholder="Blue Green"><span class="help">Enter the primary trigger. Minor typo variants are detected automatically.</span><span id="keywordError" class="field-error"></span></label>
                    </div>
                  </section>

                  <section class="form-section">
                    <div class="form-section-head">
                      <h4>3. DM flow</h4>
                      <p>This is what users see in their inbox: an opening DM, a button, then the final prompt or link.</p>
                    </div>
                    <label>Opening DM<textarea id="openingText" name="openingText" maxlength="640" required placeholder="Your prompt is ready. Tap the button below."></textarea><span class="help">The first message sent after a user comments with the trigger.</span><span id="openingTextError" class="field-error"></span></label>
                    <label>Opening DM button<input id="buttonTitle" name="buttonTitle" maxlength="20" required><span class="help">This button takes the user to the final prompt or link. Maximum 20 characters.</span><span id="buttonTitleError" class="field-error"></span></label>
                    <div id="followGateCard" class="option-card">
                      <label class="check"><input id="followGateEnabled" name="followGateEnabled" type="checkbox"> Require a follow before the final prompt</label>
                      <span class="help">If the user has not followed the account when the button is tapped, the DM asks them to follow and shows a retry button. Replying READY remains the fallback.</span>
                      <span id="followGateEnabledError" class="field-error"></span>
                      <label>Not-following message<textarea id="followGateText" name="followGateText" maxlength="640" placeholder="Follow this account, then tap this button again. If the button does not appear, reply READY."></textarea><span class="help">Optional. Leave blank to use the automatic default text based on the button label.</span><span id="followGateTextError" class="field-error"></span></label>
                      <label>Not-following retry button<input id="followGateButtonTitle" name="followGateButtonTitle" maxlength="20" placeholder="I FOLLOWED"><span class="help">Optional. Leave blank to reuse the opening DM button label.</span><span id="followGateButtonTitleError" class="field-error"></span></label>
                    </div>
                    <details class="template-panel">
                      <summary>
                        <span>
                          <strong>Optional: opening DM variants</strong>
                          <span>Use several versions so the message is not always identical.</span>
                        </span>
                        <span class="summary-action">Open</span>
                      </summary>
                      <div class="variant-library">
                        <label>Opening DM variants<textarea id="openingTextVariants" name="openingTextVariants" placeholder="Your prompt is ready. Tap the button below.&#10;The prompt is ready. Continue with this button."></textarea><span class="help">One variant per line. The primary opening DM is also included as a variant.</span><span id="openingTextVariantsError" class="field-error"></span></label>
                        <div class="variant-library-head">
                          <div>
                            <strong>Opening DM library</strong>
                            <span class="help">Click a template to add it as a variant. You still need to save the campaign.</span>
                          </div>
                          <label>Search<input id="openingTemplateSearch" placeholder="Search opening DMs…" autocomplete="off"></label>
                        </div>
                        <div id="openingTemplateList" class="template-list">
                          <div class="empty">No templates yet.</div>
                        </div>
                        <div class="template-actions">
                          <button id="saveOpeningTemplatesButton" type="button">Save opening DMs to library</button>
                        </div>
                      </div>
                    </details>
                    <details id="dmStepPanel" class="template-panel dm-step-panel" hidden>
                      <summary>
                        <span>
                          <strong>Optional: additional DM steps</strong>
                          <span id="dmStepSummary">Optional. Without additional steps, the first button sends the final prompt or link.</span>
                        </span>
                        <span class="summary-action">Configure</span>
                      </summary>
                      <div class="dm-step-editor">
                        <p class="help">Use this when a user should pass through several buttons before receiving the final prompt or link. Maximum 3 additional steps.</p>
                        <div id="dmStepsList" class="dm-step-list"></div>
                        <div class="dm-step-actions">
                          <span id="dmStepsError" class="field-error"></span>
                          <button id="addDmStepButton" class="secondary" type="button">Add step</button>
                        </div>
                      </div>
                    </details>
                    <label>Final prompt or link<textarea id="deliveryText" name="deliveryText" maxlength="2000" required placeholder="Paste a Notion link or enter the complete prompt here."></textarea><span class="help">The main content the user receives at the end of the DM flow.</span><span id="deliveryTextError" class="field-error"></span></label>
                  </section>

                  <section class="form-section">
                    <div class="form-section-head">
                      <h4>4. Public comment reply</h4>
                      <p>Appears as a comment reply after the opening DM is sent. Leave blank to disable public replies.</p>
                    </div>
                    <label>Primary public reply<textarea id="commentReplyText" name="commentReplyText" maxlength="300" placeholder="Check your DMs"></textarea><span class="help">Optional. Useful for telling the user that the DM was sent. Maximum 300 characters.</span><span id="commentReplyTextError" class="field-error"></span></label>
                    <label>Reply when the DM fails<textarea id="openingFailureReplyText" name="openingFailureReplyText" maxlength="300" placeholder="We could not send your DM. Allow DMs, then comment PROMPT again as a new comment."></textarea><span class="help">Optional. Sent as a public reply when the opening DM is rejected because the user cannot receive messages.</span><span id="openingFailureReplyTextError" class="field-error"></span></label>
                    <details class="template-panel">
                      <summary>
                        <span>
                          <strong>Optional: public reply variants</strong>
                          <span>Use several versions to make comment replies feel more natural.</span>
                        </span>
                        <span class="summary-action">Open</span>
                      </summary>
                      <div class="variant-library">
                        <label>Public reply variants<textarea id="commentReplyTextVariants" name="commentReplyTextVariants" placeholder="Sent it to your DMs&#10;Check your DMs&#10;Done—check your DMs"></textarea><span class="help">One variant per line. The primary reply is also included as a variant.</span><span id="commentReplyTextVariantsError" class="field-error"></span></label>
                        <div class="variant-library-head">
                          <div>
                            <strong>Public reply library</strong>
                            <span class="help">Click a template to add it as a variant. You still need to save the campaign.</span>
                          </div>
                          <label>Search<input id="commentReplyTemplateSearch" placeholder="Search replies…" autocomplete="off"></label>
                        </div>
                        <div id="commentReplyTemplateList" class="template-list">
                          <div class="empty">No templates yet.</div>
                        </div>
                        <div class="template-actions">
                          <button id="saveCommentReplyTemplatesButton" type="button">Save replies to library</button>
                        </div>
                      </div>
                    </details>
                  </section>

                  <section id="activationCard" class="activation-card draft">
                    <div>
                      <strong id="activationTitle">Draft</strong>
                      <span id="activationCopy" class="help">Save as a draft first. Activate it after reviewing the campaign content.</span>
                    </div>
                    <input id="enabled" name="enabled" type="checkbox" hidden>
                  </section>
                  <details class="advanced-panel">
                    <summary>Advanced settings</summary>
                    <div class="advanced-body">
                      <div class="field-row">
                        <label>Post ID<input id="mediaId" name="mediaId" aria-required="true"><span class="help">Filled automatically from the selected post. You can paste it manually if the post list fails to load.</span><span id="mediaIdAdvancedError" class="field-error"></span></label>
                        <label>Campaign ID<input id="campaignId" name="campaignId" required><span class="help">Generated automatically. Change it only when you need a specific ID.</span><span id="campaignIdError" class="field-error"></span></label>
                      </div>
                      <div class="field-row">
                        <label>Button payload<input id="buttonPayload" name="buttonPayload" required readonly><span class="help">Generated automatically to identify the button the user tapped.</span><span id="buttonPayloadError" class="field-error"></span></label>
                      </div>
                    </div>
                  </details>
                  <div id="formStatus" class="notice show ok" role="status" aria-live="polite">Select a campaign or create a new one.</div>
                  <div id="summaryPreview" class="mode-note">
                    <strong>Summary</strong>
                    <span class="help">No campaign selected.</span>
                  </div>
                  <div id="notice" class="notice" role="status" aria-live="polite"></div>
                  <div class="editor-actions">
                    <button id="newCampaignButtonTop" class="secondary action-hidden" type="button">Create campaign</button>
                    <button id="reloadCampaignButton" type="button">Discard changes</button>
                    <button id="reloadCampaignButtonBottom" class="action-hidden" type="button">Reset form</button>
                    <button id="saveCampaignButtonTop" class="primary action-hidden" type="button">Save</button>
                    <button id="saveCampaignButton" class="primary action-hidden" type="submit">Save campaign</button>
                  </div>
                </form>
              </div>
            </div>

            <aside class="surface preview-panel" aria-label="Campaign preview">
              <div class="surface-head">
                <h3>Follower preview</h3>
                <span id="previewState" class="pill off">draft</span>
              </div>
              <div class="preview-body">
                <div class="readiness-list" aria-label="Pre-activation checklist">
                  <strong>Pre-activation checklist</strong>
                    <button id="readyPost" class="readiness-item missing" type="button"><span>Post</span><span>Not selected</span></button>
                    <button id="readyKeyword" class="readiness-item missing" type="button"><span>Trigger</span><span>Not entered</span></button>
                    <button id="readyOpening" class="readiness-item missing" type="button"><span>Opening DM + button</span><span>Incomplete</span></button>
                    <button id="readyFollowGate" class="readiness-item missing" type="button"><span>Follow gate</span><span>Off</span></button>
                    <button id="readyFinal" class="readiness-item missing" type="button"><span>Final prompt or link</span><span>Not entered</span></button>
                    <button id="readyReply" class="readiness-item ok" type="button"><span>Public reply</span><span>Off</span></button>
                </div>
                <div class="ig-preview-block">
                  <div>
                    <h4>In the post comments</h4>
                    <span class="preview-muted">Simulation after a user comments with the trigger.</span>
                  </div>
                  <div class="comment-preview">
                    <div class="comment-line">
                      <span class="comment-avatar">U</span>
                      <div class="comment-copy">
                        <strong>@user</strong>
                        <span id="previewUserComment" class="preview-empty">Trigger word or phrase not entered.</span>
                      </div>
                    </div>
                    <div class="comment-line comment-reply">
                    <span class="comment-avatar">B</span>
                      <div class="comment-copy">
                        <strong>@example_creator</strong>
                        <span id="previewPublicReply" class="preview-empty">Optional. Leave blank to disable public comment replies.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="ig-preview-block">
                  <div>
                    <h4>In the user's DMs</h4>
                    <span class="preview-muted">Simulation of the flow the user receives in their inbox.</span>
                  </div>
                  <div class="dm-phone">
                    <div class="dm-header">
                      <span class="dm-avatar">B</span>
                      <div>
                        <strong>Example Creator</strong>
                        <div class="preview-muted">@example_creator</div>
                      </div>
                    </div>
                    <div id="previewDmThread" class="dm-thread">
                      <div class="dm-card">
                        <p id="previewOpening" class="preview-empty">Opening DM not entered.</p>
                        <div id="previewButtonTitle" class="dm-button-preview">SEND PROMPT</div>
                      </div>
                      <div id="previewTapBubble" class="dm-bubble user">SEND PROMPT</div>
                      <div id="previewDelivery" class="dm-bubble brand preview-empty">Final prompt or link not entered.</div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <details class="system-panel">
              <summary>
                <strong>Status sistem</strong>
                <span id="runtimeStatus" class="pill ok">online</span>
              </summary>
              <div class="system-body">
                <div>
                  <h3>System status</h3>
                  <div class="runtime-list">
                    <div class="runtime-item"><span>Instagram connection</span><strong id="tokenSource">-</strong></div>
                    <div class="runtime-item"><span>Expires</span><strong id="tokenExpiry">-</strong></div>
                    <div class="runtime-item"><span>Last error</span><strong id="tokenError">-</strong></div>
                    <div class="runtime-item"><span>Send limit</span><strong id="sendLimit">-</strong></div>
                    <div class="runtime-item"><span>Post polling limit</span><strong id="pollLimit">-</strong></div>
                  </div>
                </div>
                <div>
                  <h3>Selected campaign <span id="selectedState" class="pill off">none</span></h3>
                  <div class="runtime-list">
                    <div class="runtime-item"><span>Trigger</span><strong id="selectedKeyword">-</strong></div>
                    <div class="runtime-item"><span>Post ID</span><strong id="selectedMedia">-</strong></div>
                    <div class="runtime-item"><span>Public reply</span><strong id="selectedReply">-</strong></div>
                  </div>
                </div>
              </div>
            </details>
          </section>
        </main>
      </section>
    </div>

    ${turnstileScript}
    <script nonce="${nonce}">
      const state = {
        csrfToken: "",
        campaigns: [],
        media: [],
        templates: [],
        selectedId: null,
        selectedMediaId: null,
        dashboard: null,
        mode: "empty",
        dirty: false,
        saving: false,
        mediaLoaded: false
      };
      const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
      const CSRF_HEADER = "X-CSRF-Token";
      const MAX_DM_STEPS = 3;
      let inactivityTimer = null;
      let summaryTimer = null;
      let mediaLoading = false;

      const $ = (id) => document.getElementById(id);
      const formFields = [
        "name",
        "mediaId",
        "keyword",
        "buttonTitle",
        "buttonPayload",
        "openingText",
        "deliveryText",
        "commentReplyText",
        "openingFailureReplyText",
        "enabled",
        "followGateEnabled",
        "followGateText",
        "followGateButtonTitle"
      ];
      const variantFields = ["openingTextVariants", "commentReplyTextVariants"];
      const inputs = ["campaignId", ...formFields, ...variantFields];

      $("loginForm").addEventListener("submit", connect);
      $("clearButton").addEventListener("click", lockConsole);
      $("refreshButton").addEventListener("click", guardedRefreshAll);
      $("quickStartButton").addEventListener("click", startNewCampaign);
      $("reloadMediaButton").addEventListener("click", reloadMedia);
      $("postPickerPanel").addEventListener("toggle", () => {
        if ($("postPickerPanel").open) void ensureMediaLoaded();
      });
      $("newCampaignButtonSide").addEventListener("click", startNewCampaign);
      $("newCampaignButtonTop").addEventListener("click", startNewCampaign);
      $("reloadCampaignButton").addEventListener("click", resetCurrentForm);
      $("reloadCampaignButtonBottom").addEventListener("click", resetCurrentForm);
      $("saveDraftButton").addEventListener("click", () => $("campaignForm").requestSubmit());
      $("saveCampaignButtonTop").addEventListener("click", () => $("campaignForm").requestSubmit());
      $("campaignForm").addEventListener("submit", saveCampaign);
      $("campaignForm").addEventListener("invalid", handleInvalidField, true);
      $("addDmStepButton").addEventListener("click", () => {
        addDmStep();
        markDirty();
      });
      $("goLiveButton").addEventListener("click", () => void goLiveCampaign());
      $("pauseCampaignButton").addEventListener("click", () => void pauseCampaign());
      $("deleteCampaignButton").addEventListener("click", () => void deleteCampaign());
      $("openingTemplateSearch").addEventListener("input", renderTemplateLibraries);
      $("commentReplyTemplateSearch").addEventListener("input", renderTemplateLibraries);
      $("saveOpeningTemplatesButton").addEventListener("click", () => saveTemplatesFromForm("opening"));
      $("saveCommentReplyTemplatesButton").addEventListener("click", () => saveTemplatesFromForm("comment_reply"));
      bindReadyAction("readyPost", () => {
        $("postPickerPanel").open = true;
        $("postPickerPanel").querySelector("summary")?.focus();
        void ensureMediaLoaded();
      });
      bindReadyAction("readyKeyword", () => $("keyword").focus());
      bindReadyAction("readyOpening", () => $("openingText").focus());
      bindReadyAction("readyFollowGate", () => $("followGateEnabled").focus());
      bindReadyAction("readyFinal", () => $("deliveryText").focus());
      bindReadyAction("readyReply", () => $("commentReplyText").focus());
      $("keyword").addEventListener("input", syncGeneratedFields);
      $("name").addEventListener("input", syncGeneratedFields);
      $("campaignId").addEventListener("input", () => {
        $("campaignId").dataset.generated = "false";
        syncPayloadFromCampaignId();
        markDirty();
      });
      for (const field of [...formFields, ...variantFields]) {
        const input = $(field);
        input.addEventListener(input.type === "checkbox" ? "change" : "input", markDirty);
      }
      for (const eventName of ["click", "keydown", "pointerdown"]) {
        document.addEventListener(eventName, resetInactivityTimer, { passive: true });
      }
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") resetInactivityTimer();
      });
      window.addEventListener("beforeunload", (event) => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = "";
      });

      setFormEnabled(false);
      void resumeSession();

      function bindReadyAction(id, action) {
        $(id).addEventListener("click", action);
      }

      async function resumeSession() {
        setLoginLoading(true, "Checking access…");
        try {
          const response = await fetch("/admin/session", {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin"
          });
          if (!response.ok) {
            showLoginScreen();
            return;
          }
          const body = await response.json().catch(() => ({}));
          if (!body.csrfToken) {
            showLoginScreen();
            return;
          }
          state.csrfToken = body.csrfToken;
          await refreshAll();
          showWorkspace();
        } catch {
          state.csrfToken = "";
          showLoginScreen();
        } finally {
          setLoginLoading(false);
        }
      }

      async function connect(event) {
        event.preventDefault();
        const username = $("adminUsername").value.trim();
        const password = $("adminPassword").value;
        const adminToken = $("adminToken").value.trim();
        const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || "";
        if (!username || !password || !adminToken) return showLoginNotice("Username, password, and security key are required.", false);
        if (${turnstileEnabled ? "true" : "false"} && !turnstileToken) return showLoginNotice("Complete the security verification first", false);
        setLoginLoading(true);
        try {
          const response = await fetch("/admin/session", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, adminToken, turnstileToken })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const error = new Error(body.error || "Sign-in failed");
            error.status = response.status;
            throw error;
          }
          state.csrfToken = body.csrfToken;
          applyBootstrap(body.bootstrap || await adminFetch("/admin/bootstrap"));
          showWorkspace();
          $("adminUsername").value = "";
          $("adminPassword").value = "";
          $("adminToken").value = "";
          showLoginNotice("", true);
        } catch (error) {
          const message = error.status === 401 || error.status === 403 ? "Sign-in failed" : error.message || "Access failed";
          clearToken();
          showLoginNotice(message, false);
          window.turnstile?.reset?.();
        } finally {
          setLoginLoading(false);
        }
      }

      function showLoginScreen() {
        $("bootScreen").hidden = true;
        $("lockScreen").hidden = false;
        $("workspace").hidden = true;
      }

      function showWorkspace() {
        $("bootScreen").hidden = true;
        $("lockScreen").hidden = true;
        $("workspace").hidden = false;
        updateWorkspaceChrome();
      }

      function applyBootstrap(bootstrap) {
        if (!bootstrap) return;
        state.dashboard = bootstrap.dashboard;
        state.campaigns = bootstrap.campaigns || [];
        state.templates = bootstrap.templates || [];
        renderDashboard(state.dashboard);
        renderCampaigns();
        renderTemplateLibraries();
        renderMedia();
        if (state.mode === "create") {
          startNewCampaign(false, true);
        } else {
          selectCampaign(state.selectedId || state.campaigns[0]?.id || null, true);
        }
      }

      function clearToken() {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
        state.csrfToken = "";
        state.campaigns = [];
        state.media = [];
        state.templates = [];
        state.selectedId = null;
        state.selectedMediaId = null;
        state.dashboard = null;
        state.mediaLoaded = false;
        state.mode = "empty";
        state.dirty = false;
        state.saving = false;
        $("adminUsername").value = "";
        $("adminPassword").value = "";
        $("adminToken").value = "";
        clearForm();
        showLoginScreen();
        renderCampaigns();
        renderMedia();
        renderTemplateLibraries();
        updateFormStatus("Select a campaign or create a new one.", "ok");
        updateSummaryPreview();
        setFormEnabled(false);
      }

      async function lockConsole() {
        if (!confirmDiscard("and lock the dashboard")) return;
        await revokeSession();
        clearToken();
      }

      async function revokeSession() {
        const csrfToken = state.csrfToken;
        if (!csrfToken) return;
        await fetch("/admin/session", {
          method: "DELETE",
          cache: "no-store",
          credentials: "same-origin",
          headers: { [CSRF_HEADER]: csrfToken }
        }).catch(() => {});
      }

      async function refreshAll() {
        if (!state.csrfToken) throw new Error("The admin session is not active");
        setWorkspaceLoading(true);
        try {
          applyBootstrap(await adminFetch("/admin/bootstrap"));
          showWorkspace();
        } catch (error) {
          if (error.status === 401 || error.status === 403) {
            clearToken();
            showLoginNotice("Your session expired. Please sign in again.", false);
          }
          throw error;
        } finally {
          setWorkspaceLoading(false);
        }
      }

      async function refreshDashboardOnly() {
        state.dashboard = await adminFetch("/admin/dashboard");
        renderDashboard(state.dashboard);
      }

      async function guardedRefreshAll() {
        if (!confirmDiscard("refreshing the data")) return;
        try {
          await refreshAll();
        } catch (error) {
          showNotice(error.message || "Failed to refresh data.", false);
        }
      }

      async function adminFetch(path, options = {}) {
        resetInactivityTimer();
        const response = await fetch(path, {
          ...options,
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            ...(options.headers || {}),
            [CSRF_HEADER]: state.csrfToken
          }
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(formatApiError(body, response.status));
          error.status = response.status;
          error.body = body;
          error.details = body.details;
          throw error;
        }
        return body;
      }

      async function loadVariantTemplates() {
        try {
          const body = await adminFetch("/admin/variant-templates");
          state.templates = body.templates || [];
        } catch {
          state.templates = [];
        }
        return state.templates;
      }

      function renderDashboard(dashboard) {
        const counts = dashboard?.counts || {};
        $("campaignCount").textContent = counts.campaigns ?? "-";
        $("deliveryCount").textContent = counts.deliveries ?? "-";
        $("failedCount").textContent = counts.failedDeliveries ?? "-";
        $("retryingCount").textContent = counts.retryingDeliveries ?? "-";
        const unknownStatusCount = counts.sendStatusUnknownDeliveries ?? 0;
        $("unknownStatusCount").textContent = String(unknownStatusCount);
        $("unknownStatusMetric").className = "metric" + (unknownStatusCount > 0 ? " warn" : "");
        $("unknownStatusMetric").title = unknownStatusCount > 0
          ? "Meta may have accepted these sends. Reconcile them manually before retrying."
          : "No deliveries require manual reconciliation.";

        const token = dashboard?.token || {};
        $("tokenSource").textContent = token.source || "-";
        $("tokenExpiry").textContent = formatDate(token.expiresAt);
        $("tokenError").textContent = token.lastError || "none";
        const runtimeNeedsReview = Boolean(token.lastError) || unknownStatusCount > 0;
        $("runtimeStatus").textContent = runtimeNeedsReview ? "check" : "online";
        $("runtimeStatus").className = "pill " + (runtimeNeedsReview ? "warn" : "ok");
        $("sendLimit").textContent = (dashboard?.limits?.metaSendsPerMinute ?? "-") + "/min";
        $("pollLimit").textContent = String(dashboard?.limits?.pollLimitPerMedia ?? "-");
        $("readinessRuntime").textContent = token.lastError
          ? "check token"
          : unknownStatusCount > 0
            ? "reconcile delivery"
            : "ready";
        $("readinessLive").textContent = String(counts.enabledCampaigns ?? 0);
        $("readinessToken").textContent = token.source || "-";
        $("readinessError").textContent = token.lastError || (unknownStatusCount > 0
          ? unknownStatusCount + " delivery status unknown"
          : "none");
      }

      function renderCampaigns() {
        const list = $("campaignList");
        list.textContent = "";
        if (!state.campaigns.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No campaigns yet. Click Create campaign.";
          list.append(empty);
          return;
        }

        for (const campaign of state.campaigns) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "campaign-row" + (campaign.id === state.selectedId ? " active" : "");
          row.setAttribute("aria-pressed", campaign.id === state.selectedId ? "true" : "false");
          row.addEventListener("click", () => selectCampaign(campaign.id));

          const title = document.createElement("strong");
          title.textContent = campaign.name || campaign.id;

          const meta = document.createElement("small");
          meta.textContent = campaign.keyword ? "Trigger: " + campaign.keyword : "Trigger not entered";

          const status = document.createElement("span");
          status.className = "pill " + (campaign.enabled ? "ok" : "off");
          status.textContent = campaign.enabled ? "active" : "draft";

          row.append(title, meta, status);
          list.append(row);
        }
      }

      async function reloadMedia() {
        if (mediaLoading) return;
        mediaLoading = true;
        $("reloadMediaButton").disabled = true;
        try {
          const media = await adminFetch("/admin/media?limit=12");
          state.media = media.data || [];
          state.mediaLoaded = true;
          renderMedia();
        } catch (error) {
          renderMedia(error.message || "Failed to load posts");
        } finally {
          mediaLoading = false;
          $("reloadMediaButton").disabled = false;
        }
      }

      async function ensureMediaLoaded() {
        if (state.mediaLoaded || mediaLoading) return;
        await reloadMedia();
      }

      function renderMedia(errorMessage = "") {
        const list = $("postList");
        list.textContent = "";
        showMediaNotice(errorMessage, false);

        if (!state.media.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = errorMessage ? "Failed to load posts. Paste the post ID in Advanced settings." : "Recent posts have not appeared yet. Click Refresh, or paste the post ID in Advanced settings.";
          list.append(empty);
          return;
        }

        for (const media of state.media) {
          const row = document.createElement("div");
          row.className = "post-row" + (media.id === state.selectedMediaId ? " active" : "");

          const title = document.createElement("strong");
          title.textContent = media.caption ? truncate(media.caption, 92) : "Instagram post";

          const meta = document.createElement("small");
          meta.textContent = media.id;

          const details = document.createElement("div");
          details.className = "post-meta";
          const timestamp = document.createElement("span");
          timestamp.textContent = formatDate(media.timestamp);
          const type = document.createElement("span");
          type.textContent = media.mediaType || media.mediaProductType || "media";
          details.append(timestamp, type);

          const actions = document.createElement("div");
          actions.className = "post-actions";
          const useButton = document.createElement("button");
          useButton.type = "button";
          useButton.className = "secondary";
          useButton.textContent = media.id === state.selectedMediaId ? "Selected" : "Use this post";
          useButton.setAttribute("aria-pressed", media.id === state.selectedMediaId ? "true" : "false");
          useButton.addEventListener("click", () => selectMedia(media));
          actions.append(useButton);
          const permalink = safeHttpsUrl(media.permalink);
          if (permalink) {
            const link = document.createElement("a");
            link.className = "post-link";
            link.href = permalink;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = "View on Instagram";
            actions.append(link);
          }

          row.append(title, meta, details, actions);
          list.append(row);
        }
      }

      function selectMedia(media) {
        const shouldReplaceGenerated = state.mode === "create" && $("campaignId").dataset.generated !== "false";
        if (state.mode === "empty") {
          startNewCampaign(false, true, media);
          return;
        }
        state.selectedMediaId = media.id;
        $("mediaId").value = media.id;
        if (state.mode === "create" && (shouldReplaceGenerated || !$("name").value.trim())) $("name").value = postName(media);
        syncGeneratedFields(shouldReplaceGenerated);
        renderMedia();
        markDirty();
        updatePostPickerLabel();
      }

      function startNewCampaign(showMessage = true, force = false, presetMedia = null) {
        if (typeof showMessage !== "boolean") showMessage = true;
        if (!force && !confirmDiscard("and create a new campaign")) return;
        state.mode = "create";
        state.selectedId = null;
        const selectedMedia = presetMedia || null;
        state.selectedMediaId = selectedMedia?.id || null;
        renderCampaigns();
        renderMedia();
        clearForm();
        $("enabled").checked = false;
        $("followGateEnabled").checked = false;
        $("buttonTitle").value = "SEND PROMPT";
        $("commentReplyText").value = "Check your DMs";
        $("commentReplyTextVariants").value = "";
        $("openingTextVariants").value = "";
        renderDmSteps([]);
        $("campaignId").dataset.generated = "true";
        if (selectedMedia) {
          $("mediaId").value = selectedMedia.id;
          $("name").value = postName(selectedMedia);
        }
        syncGeneratedFields(true);
        updateSelectionPanel({
          id: "New campaign",
          keyword: $("keyword").value,
          mediaId: $("mediaId").value,
          commentReplyText: $("commentReplyText").value,
          enabled: false
        });
        $("editorTitle").textContent = "New campaign";
        $("modeNote").querySelector("strong").textContent = "New draft";
        $("modeNote").querySelector("span").textContent = "Select a post, enter the trigger, paste the prompt, then save it as a draft. Activation is a separate step.";
        $("postPickerPanel").open = !selectedMedia;
        $("campaignId").readOnly = false;
        setFormEnabled(true);
        updateWorkspaceChrome();
        state.dirty = false;
        updateFormStatus("New draft. Save it before activating the campaign.", "warn");
        updateSummaryPreview();
        updateActivationPanel();
        if (!selectedMedia) void ensureMediaLoaded();
        if (showMessage) showNotice("A new campaign draft is ready. Select a post and enter the trigger.", true);
      }

      function selectCampaign(id, force = false) {
        if (!force && state.selectedId !== id && !confirmDiscard("and switch campaigns")) return;
        state.selectedId = id;
        state.mode = id ? "edit" : "empty";
        const campaign = state.campaigns.find((item) => item.id === id);
        renderCampaigns();
        if (!campaign) {
          $("selectedCampaignId").textContent = "No campaign selected";
          $("selectedState").textContent = "none";
          $("selectedState").className = "pill off";
          $("selectedKeyword").textContent = "-";
          $("selectedMedia").textContent = "-";
          $("selectedReply").textContent = "-";
          $("editorTitle").textContent = "Campaign editor";
          $("modeNote").querySelector("strong").textContent = "Select a campaign";
          $("modeNote").querySelector("span").textContent = "Select a campaign from the list or create a new one.";
          $("postPickerPanel").open = false;
          clearForm();
          state.selectedMediaId = null;
          renderMedia();
          state.dirty = false;
          updateFormStatus("Select a campaign or create a new one.", "ok");
          updateSummaryPreview();
          setFormEnabled(false);
          updateActivationPanel();
          updateWorkspaceChrome();
          return;
        }

        state.selectedMediaId = campaign.mediaId;
        $("campaignId").value = campaign.id;
        $("campaignId").readOnly = true;
        $("campaignId").dataset.generated = "false";
        for (const field of formFields) {
          const input = $(field);
          if (input.type === "checkbox") input.checked = Boolean(campaign[field]);
          else input.value = campaign[field] ?? "";
        }
        $("openingTextVariants").value = formatVariantTextarea(campaign.openingTextVariants, campaign.openingText);
        $("commentReplyTextVariants").value = formatVariantTextarea(campaign.commentReplyTextVariants, campaign.commentReplyText);
        renderDmSteps([]);
        $("editorTitle").textContent = "Edit campaign";
        $("modeNote").querySelector("strong").textContent = campaign.enabled ? "Campaign active" : "Campaign draft";
        $("modeNote").querySelector("span").textContent = "Changes take effect after saving. Open Monitored post to change the target post.";
        $("postPickerPanel").open = false;
        updateSelectionPanel(campaign);
        renderMedia();
        setFormEnabled(true);
        updateWorkspaceChrome();
        state.dirty = false;
        updateFormStatus(campaign.enabled ? "Active. Changes take effect after saving." : "Draft saved. Activate it after reviewing all content.", campaign.enabled ? "ok" : "warn");
        updateSummaryPreview();
        updateActivationPanel(campaign);
      }

      async function saveCampaign(event, forcedEnabled = null) {
        event?.preventDefault();
        if (state.saving) return;
        clearFieldErrors();
        const currentId = state.mode === "edit" ? state.selectedId : $("campaignId").value.trim();
        const campaignId = slugify(currentId);
        if (!campaignId) return showNotice("Campaign ID is required.", false);
        $("campaignId").value = campaignId;
        syncPayloadFromCampaignId();
        if (!requireSelectedPost()) return;

        const payload = { id: campaignId };
        for (const field of formFields) {
          const input = $(field);
          payload[field] = input.type === "checkbox" ? input.checked : input.value.trim();
        }
        if (forcedEnabled !== null) payload.enabled = forcedEnabled;
        payload.openingTextVariants = collectVariantPool(payload.openingText, $("openingTextVariants").value);
        const dmStepRead = isDmStepUiEnabled() ? readDmSteps() : { steps: [], invalid: null };
        if (dmStepRead.invalid) {
          setFieldError("dmSteps", dmStepRead.invalid.message);
          updateFormStatus(dmStepRead.invalid.message, "bad");
          showNotice(dmStepRead.invalid.message, false);
          dmStepRead.invalid.node.focus();
          return;
        }
        payload.dmSteps = dmStepRead.steps;
        payload.commentReplyTextVariants = collectVariantPool(payload.commentReplyText, $("commentReplyTextVariants").value);
        if (!payload.commentReplyText && payload.commentReplyTextVariants.length) {
          payload.commentReplyText = payload.commentReplyTextVariants[0];
        }
        payload.commentReplyText = payload.commentReplyText || null;
        payload.openingFailureReplyText = payload.openingFailureReplyText || null;
        payload.followGateText = payload.followGateText || null;
        payload.followGateButtonTitle = payload.followGateButtonTitle || null;
        payload.buttonPayload = campaignId + ":confirm";
        payload.writeMode = state.mode === "create" ? "create" : "update";
        const currentCampaign = state.campaigns.find((item) => item.id === campaignId);
        if (forcedEnabled === null && currentCampaign?.enabled && !confirm("This campaign is active. Changes will take effect after saving. Continue?")) return;

        state.saving = true;
        updateActionLock();
        setSaveState("saving…", "warn");
        try {
          const saved = await adminFetch("/admin/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          showNotice("Saved", true);
          setSaveState("saved", "ok");
          state.dirty = false;
          updateFormStatus(payload.enabled ? "Saved and active." : "Saved as a draft. The campaign will not respond to comments until it is activated.", payload.enabled ? "ok" : "warn");
          upsertLocalCampaign(saved?.campaign || payload);
          await refreshDashboardOnly();
          selectCampaign(campaignId, true);
        } catch (error) {
          showFieldErrors(error.details);
          showNotice(error.message || "Failed to save the campaign.", false);
          setSaveState("error", "bad");
          updateFormStatus(error.message || "Failed to save the campaign.", "bad");
        } finally {
          state.saving = false;
          updateActionLock();
          setTimeout(() => setSaveState("ready", "off"), 1600);
        }
      }

      async function goLiveCampaign() {
        if (state.mode === "empty") return;
        clearFieldErrors();
        if (!requireSelectedPost()) return;
        if (!$("campaignForm").reportValidity()) return;
        const summary = $("summaryPreview").querySelector("span").textContent;
        if (!confirm("Activate this campaign?\\n\\n" + summary + "\\n\\nOnce active, matching comments can be processed immediately.")) return;
        await saveCampaign(null, true);
      }

      async function pauseCampaign() {
        if (state.mode !== "edit" || !state.selectedId || state.saving) return;
        if (state.dirty && !confirm("Pause applies only to the saved campaign. Unsaved changes will be discarded. Continue?")) return;
        if (!confirm("Pause this campaign? Auto-replies stop until the campaign is activated again.")) return;
        state.saving = true;
        updateActionLock();
        try {
          setSaveState("pausing…", "warn");
          await adminFetch("/admin/campaigns/" + encodeURIComponent(state.selectedId), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false })
          });
          showNotice("Campaign paused.", true);
          state.dirty = false;
          const campaign = state.campaigns.find((item) => item.id === state.selectedId);
          if (campaign) campaign.enabled = false;
          renderCampaigns();
          updateActivationPanel(campaign || null);
          await refreshDashboardOnly();
          selectCampaign(state.selectedId, true);
        } catch (error) {
          showNotice(error.message || "Failed to pause the campaign.", false);
          setSaveState("error", "bad");
        } finally {
          state.saving = false;
          updateActionLock();
        }
      }

      async function deleteCampaign() {
        if (state.mode !== "edit" || !state.selectedId || state.saving) return;
        const campaign = state.campaigns.find((item) => item.id === state.selectedId);
        const campaignId = state.selectedId;
        const campaignName = campaign?.name || campaignId;
        if (state.dirty && !confirm("Unsaved changes will be discarded before deleting the campaign. Continue?")) return;
        if (!confirm("Delete this campaign?\\n\\n" + campaignName + "\\n\\nThis campaign's delivery data and history will also be deleted.")) return;
        const confirmation = prompt("Enter the campaign ID to confirm deletion:\\n" + campaignId);
        if (confirmation !== campaignId) {
          showNotice("Deletion canceled. The campaign ID did not match.", false);
          return;
        }

        state.saving = true;
        updateActionLock();
        try {
          setSaveState("deleting…", "warn");
          await adminFetch("/admin/campaigns/" + encodeURIComponent(campaignId), { method: "DELETE" });
          state.campaigns = state.campaigns.filter((item) => item.id !== campaignId);
          state.selectedId = null;
          state.selectedMediaId = null;
          state.dirty = false;
          renderCampaigns();
          await refreshDashboardOnly();
          selectCampaign("", true);
          showNotice("Campaign deleted.", true);
          setSaveState("ready", "off");
        } catch (error) {
          showNotice(error.message || "Failed to delete the campaign.", false);
          setSaveState("error", "bad");
        } finally {
          state.saving = false;
          updateActionLock();
        }
      }

      function updateActivationPanel(campaign = null) {
        if (campaign) {
          $("enabled").checked = Boolean(campaign.enabled);
        }
        const isLive = $("enabled").checked;
        const card = $("activationCard");
        card.className = "activation-card " + (isLive ? "live" : "draft");
        $("activationTitle").textContent = isLive ? "Campaign active" : "Draft campaign";
        $("activationCopy").textContent = isLive
          ? "The campaign is active. Saved changes will apply to subsequent comments."
          : "The campaign is not running. Save it as a draft, then activate it after review.";
        $("saveDraftButton").textContent = isLive ? "Save changes" : "Save draft";
        $("goLiveButton").hidden = isLive || state.mode === "empty";
        $("pauseCampaignButton").hidden = !isLive || state.mode !== "edit";
        $("deleteCampaignButton").hidden = state.mode !== "edit";
        updateWorkspaceChrome();
      }

      function clearForm() {
        clearFieldErrors();
        for (const field of inputs) {
          const input = $(field);
          if (input.type === "checkbox") input.checked = false;
          else input.value = "";
        }
        renderDmSteps([]);
      }

      function upsertLocalCampaign(campaign) {
        if (!campaign?.id) return;
        state.campaigns = [
          campaign,
          ...state.campaigns.filter((item) => item.id !== campaign.id)
        ];
        renderCampaigns();
      }

      function requireSelectedPost() {
        if ($("mediaId").value.trim()) return true;
        const message = "Select a post to monitor first.";
        setFieldError("mediaId", message);
        $("postPickerPanel").open = true;
        updateFormStatus(message, "bad");
        showNotice(message, false);
        void ensureMediaLoaded();
        $("postPickerPanel").querySelector("summary")?.focus();
        return false;
      }

      function resetCurrentForm() {
        if (!confirmDiscard("reset form")) return;
        if (state.mode === "create") {
          startNewCampaign(false, true);
        } else {
          selectCampaign(state.selectedId, true);
        }
      }

      function markDirty() {
        if (state.mode === "empty") return;
        state.dirty = true;
        updateFormStatus("There are unsaved changes.", "warn");
        scheduleSummaryPreview();
      }

      function scheduleSummaryPreview() {
        clearTimeout(summaryTimer);
        summaryTimer = setTimeout(updateSummaryPreview, 150);
      }

      function confirmDiscard(action) {
        if (!state.dirty) return true;
        return confirm("There are unsaved changes. Continue " + action + "?");
      }

      function updateSelectionPanel(campaign) {
        $("selectedCampaignId").textContent = campaign.name || campaign.id || "New campaign";
        $("selectedState").textContent = campaign.enabled ? "active" : "draft";
        $("selectedState").className = "pill " + (campaign.enabled ? "ok" : "off");
        $("selectedKeyword").textContent = campaign.keyword || "-";
        $("selectedMedia").textContent = campaign.mediaId || "-";
        $("selectedReply").textContent = campaign.commentReplyText || "none";
        updatePostPickerLabel(campaign.mediaId);
      }

      function updateWorkspaceChrome() {
        $("quickGuide").hidden = state.mode === "edit";
        $("editorSubtitle").textContent = state.mode === "empty"
          ? "Select a campaign or create a new one."
          : $("enabled").checked
            ? "Active: saved changes apply to subsequent comments."
            : "Draft: safe to edit before activation.";
      }

      function updateFormStatus(message, tone) {
        const status = $("formStatus");
        status.textContent = message;
        status.className = "notice show " + tone;
      }

      function updateSummaryPreview() {
        if (state.mode === "empty") {
          $("summaryPreview").querySelector("span").textContent = "No campaign selected.";
          updatePostPickerLabel();
          updateVisualPreview();
          return;
        }
        const parts = [];
        if ($("mediaId").value.trim()) parts.push("Post " + $("mediaId").value.trim());
        if ($("keyword").value.trim()) parts.push("Trigger: " + $("keyword").value.trim());
        const openingCount = collectVariantPool($("openingText").value, $("openingTextVariants").value).length;
        const replyCount = collectVariantPool($("commentReplyText").value, $("commentReplyTextVariants").value).length;
        if (openingCount > 1) parts.push(openingCount + " opening DM variants");
        if (replyCount > 1) parts.push(replyCount + " public reply variants");
        if ($("openingFailureReplyText").value.trim()) parts.push("Failed-DM rescue: on");
        if ($("followGateEnabled").checked) parts.push("Follow gate: on");
        parts.push($("enabled").checked ? "Status: active" : "Status: draft");
        $("summaryPreview").querySelector("span").textContent = parts.join(" / ");
        updatePostPickerLabel();
        updateVisualPreview();
      }

      function updatePostPickerLabel(mediaId = $("mediaId").value.trim()) {
        if (!mediaId) {
          $("selectedPostLabel").textContent = "No post selected";
          return;
        }
        const media = state.media.find((item) => item.id === mediaId);
        $("selectedPostLabel").textContent = media
          ? "Selected: " + formatDate(media.timestamp) + " - " + truncate(media.caption || "Instagram post", 58)
          : "Selected: " + mediaId;
      }

      function updateVisualPreview() {
        const keyword = $("keyword").value.trim();
        const opening = $("openingText").value.trim();
        const delivery = $("deliveryText").value.trim();
        const publicReplyPool = collectVariantPool($("commentReplyText").value, $("commentReplyTextVariants").value);
        const publicReply = publicReplyPool[0] || "";
        const buttonTitle = $("buttonTitle").value.trim() || "SEND PROMPT";
        const dmSteps = isDmStepUiEnabled() ? readDmSteps({ allowPartial: true }).steps : [];
        const isLive = $("enabled").checked;

        setPreviewText("previewUserComment", keyword, "Trigger word or phrase not entered.");
        setPreviewText("previewPublicReply", publicReply, "Optional. Leave blank to disable public comment replies.");
        renderDmPreview(opening, buttonTitle, dmSteps, delivery, $("followGateEnabled").checked, $("followGateText").value.trim(), $("followGateButtonTitle").value.trim());
        updateReadinessChecklist();
        $("previewState").textContent = isLive ? "active" : "draft";
        $("previewState").className = "pill " + (isLive ? "ok" : "off");
      }

      function updateReadinessChecklist() {
        setReadyItem("readyPost", Boolean($("mediaId").value.trim()), "Ready", "Not selected");
        setReadyItem("readyKeyword", Boolean($("keyword").value.trim()), "Ready", "Not entered");
        setReadyItem("readyOpening", Boolean($("openingText").value.trim() && $("buttonTitle").value.trim()), "Ready", "Incomplete");
        setReadyItem("readyFollowGate", $("followGateEnabled").checked, "On", "Off");
        setReadyItem("readyFinal", Boolean($("deliveryText").value.trim()), "Ready", "Not entered");
        setReadyItem("readyReply", Boolean(collectVariantPool($("commentReplyText").value, $("commentReplyTextVariants").value).length), "On", "Off");
        $("followGateCard").classList.toggle("active", $("followGateEnabled").checked);
      }

      function setReadyItem(id, ready, okLabel = "ok", missingLabel = "missing") {
        const node = $(id);
        node.className = "readiness-item " + (ready ? "ok" : "missing");
        node.querySelector("span:last-child").textContent = ready ? okLabel : missingLabel;
      }

      function renderDmPreview(opening, buttonTitle, dmSteps, delivery, followGateEnabled, followGateText, followGateButtonTitle) {
        const thread = $("previewDmThread");
        thread.textContent = "";
        appendPreviewCard(thread, opening, buttonTitle, "previewOpening", "previewButtonTitle", false);
        appendPreviewTap(thread, buttonTitle, "previewTapBubble");
        dmSteps.forEach((step, index) => {
          appendPreviewCard(thread, step.text, step.buttonTitle, null, null, true);
          appendPreviewTap(thread, step.buttonTitle, null);
        });
        if (followGateEnabled) {
          const retryButtonTitle = followGateButtonTitle.trim() || buttonTitle;
          appendPreviewCard(thread, followGateInstruction(retryButtonTitle, followGateText), retryButtonTitle, null, null, true);
          appendPreviewTap(thread, retryButtonTitle, null);
        }
        const finalBubble = document.createElement("div");
        finalBubble.id = "previewDelivery";
        finalBubble.className = "dm-bubble brand" + (delivery ? "" : " preview-empty");
        finalBubble.textContent = delivery || "Final prompt or link not entered.";
        thread.append(finalBubble);
      }

      function followGateInstruction(buttonTitle, customText) {
        if (customText?.trim()) return customText.trim();
        const title = buttonTitle.trim() || "the previous button";
        return "Follow this account, then tap " + title + " again. If the button does not appear, reply READY.";
      }

      function appendPreviewCard(thread, text, buttonTitle, textId, buttonId, isStep) {
        const card = document.createElement("div");
        card.className = "dm-card" + (isStep ? " step-card" : "");
        const copy = document.createElement("p");
        if (textId) copy.id = textId;
        copy.className = text ? "" : "preview-empty";
        copy.textContent = text || (isStep ? "Step message not entered." : "Opening DM not entered.");
        const button = document.createElement("div");
        if (buttonId) button.id = buttonId;
        button.className = "dm-button-preview";
        button.classList.toggle("preview-empty", !buttonTitle);
        button.textContent = buttonTitle || (isStep ? "Step button not entered." : "Button not entered.");
        card.append(copy, button);
        thread.append(card);
      }

      function appendPreviewTap(thread, buttonTitle, id) {
        const bubble = document.createElement("div");
        if (id) bubble.id = id;
        bubble.className = "dm-bubble user";
        bubble.classList.toggle("preview-empty", !buttonTitle);
        bubble.textContent = buttonTitle || "Tap the button";
        thread.append(bubble);
      }

      function setPreviewText(id, value, fallback) {
        const node = $(id);
        node.textContent = value || fallback;
        node.classList.toggle("preview-empty", !value);
      }

      function syncGeneratedFields(force = false) {
        if (state.mode !== "create") return;
        const base = $("name").value.trim() || $("keyword").value.trim() || "campaign";
        const nextId = slugify(base);
        if (force || $("campaignId").dataset.generated !== "false") {
          $("campaignId").value = nextId;
          $("campaignId").dataset.generated = "true";
        }
        syncPayloadFromCampaignId();
      }

      function syncPayloadFromCampaignId() {
        const id = slugify($("campaignId").value.trim());
        if (!id) return;
        $("campaignId").value = id;
        $("buttonPayload").value = id + ":confirm";
      }

      function postName(media) {
        const caption = media.caption ? truncate(media.caption.replace(/\\s+/g, " "), 44) : "Instagram post";
        return caption === "Instagram post" ? "New Instagram campaign" : caption;
      }

      function slugify(value) {
        return value
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64);
      }

      function truncate(value, max) {
        if (!value) return "";
        return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
      }

      function collectVariantPool(primaryText, rawVariants) {
        const seen = new Set();
        const values = [primaryText, ...rawVariants.split(/\\r?\\n/)];
        const variants = [];
        for (const value of values) {
          const trimmed = value.trim();
          if (!trimmed || seen.has(trimmed)) continue;
          seen.add(trimmed);
          variants.push(trimmed);
        }
        return variants;
      }

      function addDmStep(step = { text: "", textVariants: [], buttonTitle: "CONTINUE" }) {
        const current = readDmSteps({ allowPartial: true }).steps;
        if (current.length >= MAX_DM_STEPS) {
          showNotice("Maximum 3 additional steps.", false);
          return;
        }
        renderDmSteps([...current, step]);
        const rows = $("dmStepsList").querySelectorAll(".dm-step-row");
        rows[rows.length - 1]?.querySelector("textarea")?.focus();
      }

      function renderDmSteps(steps = []) {
        const list = $("dmStepsList");
        list.textContent = "";
        const safeSteps = steps.slice(0, MAX_DM_STEPS);
        safeSteps.forEach((step, index) => {
          const row = document.createElement("div");
          row.className = "dm-step-row";
          row.dataset.index = String(index);

          const head = document.createElement("div");
          head.className = "dm-step-row-head";
          const title = document.createElement("strong");
          title.textContent = "DM step " + (index + 2);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = "Remove";
          remove.setAttribute("aria-label", "Remove DM step " + (index + 2));
          remove.addEventListener("click", () => {
            row.remove();
            renderDmSteps(readDmSteps({ allowPartial: true }).steps);
            markDirty();
          });
          head.append(title, remove);

          const grid = document.createElement("div");
          grid.className = "dm-step-grid";
          const textLabel = document.createElement("label");
          textLabel.textContent = "Step message";
          const textArea = document.createElement("textarea");
          textArea.className = "dm-step-text";
          textArea.maxLength = 640;
          textArea.placeholder = "Before I send the prompt, choose this option first.";
          textArea.value = step.text || "";
          textLabel.append(textArea, helpNode("The primary message for this step."));

          const buttonLabel = document.createElement("label");
          buttonLabel.textContent = "Step button";
          const buttonInput = document.createElement("input");
          buttonInput.className = "dm-step-button";
          buttonInput.maxLength = 20;
          buttonInput.placeholder = "CONTINUE";
          buttonInput.value = step.buttonTitle || "";
          buttonLabel.append(buttonInput, helpNode("Maximum 20 characters."));

          const variantsLabel = document.createElement("label");
          variantsLabel.className = "dm-step-variants";
          variantsLabel.textContent = "Step message variants";
          const variantsArea = document.createElement("textarea");
          variantsArea.className = "dm-step-variants-input";
          variantsArea.maxLength = 4096;
          variantsArea.placeholder = "Variant 1 for this step\\nVariant 2 for this step";
          variantsArea.value = formatVariantTextarea(step.textVariants || [], step.text || "");
          variantsLabel.append(variantsArea, helpNode("Optional. One variant per line. The primary message is also included as a variant."));

          for (const input of [textArea, buttonInput, variantsArea]) {
            input.disabled = state.mode === "empty";
            input.addEventListener("input", markDirty);
          }

          grid.append(textLabel, buttonLabel, variantsLabel);
          row.append(head, grid);
          list.append(row);
        });
        updateDmStepSummary(safeSteps.length);
        $("addDmStepButton").disabled = state.mode === "empty" || safeSteps.length >= MAX_DM_STEPS;
      }

      function readDmSteps(options = {}) {
        const allowPartial = Boolean(options.allowPartial);
        const steps = [];
        const rows = Array.from($("dmStepsList").querySelectorAll(".dm-step-row"));
        for (const row of rows) {
          const textNode = row.querySelector(".dm-step-text");
          const buttonNode = row.querySelector(".dm-step-button");
          const variantsNode = row.querySelector(".dm-step-variants-input");
          const text = textNode.value.trim();
          const buttonTitle = buttonNode.value.trim();
          const rawVariants = variantsNode?.value || "";
          if (!text && !buttonTitle && !rawVariants.trim()) continue;
          if (!allowPartial && (!text || !buttonTitle)) {
            return {
              steps,
              invalid: {
                node: text ? buttonNode : textNode,
                message: "Each additional step must have a message and a button. Remove unused steps."
              }
            };
          }
          steps.push({
            text,
            textVariants: text ? collectVariantPool(text, rawVariants) : [],
            buttonTitle
          });
        }
        return { steps, invalid: null };
      }

      function updateDmStepSummary(count = readDmSteps({ allowPartial: true }).steps.length) {
        $("dmStepSummary").textContent = count
          ? count + " additional steps before the final prompt or link."
          : "Optional. Without additional steps, the first button sends the final prompt or link.";
      }

      function isDmStepUiEnabled() {
        return !$("dmStepPanel").hidden;
      }

      function helpNode(text) {
        const span = document.createElement("span");
        span.className = "help";
        span.textContent = text;
        return span;
      }

      function formatVariantTextarea(variants = [], primaryText = "") {
        return variants.filter((value) => value && value !== primaryText).join("\\n");
      }

      function setFormEnabled(enabled) {
        for (const field of inputs) $(field).disabled = !enabled;
        updateActionLock(enabled);
        $("saveOpeningTemplatesButton").disabled = !enabled;
        $("saveCommentReplyTemplatesButton").disabled = !enabled;
        renderDmSteps(isDmStepUiEnabled() ? readDmSteps({ allowPartial: true }).steps : []);
      }

      function updateActionLock(formEnabled = state.mode !== "empty") {
        const disabled = !formEnabled || state.saving;
        $("saveCampaignButton").disabled = disabled;
        $("saveDraftButton").disabled = disabled;
        $("goLiveButton").disabled = disabled;
        $("pauseCampaignButton").disabled = disabled;
        $("deleteCampaignButton").disabled = disabled || state.mode !== "edit";
        $("saveCampaignButtonTop").disabled = disabled;
        $("reloadCampaignButton").disabled = !formEnabled || state.saving;
        $("reloadCampaignButtonBottom").disabled = !formEnabled || state.saving;
      }

      function setLoginLoading(loading, label = "Checking access…") {
        $("connectButton").disabled = loading;
        $("connectButton").textContent = loading ? label : "Sign in";
      }

      function setWorkspaceLoading(loading) {
        $("refreshButton").disabled = loading;
        $("connectionState").textContent = loading ? "Loading data…" : "Connected";
      }

      function showLoginNotice(message, ok) {
        const notice = $("loginNotice");
        notice.textContent = message;
        notice.className = message ? "notice show " + (ok ? "ok" : "bad") : "notice";
      }

      function showNotice(message, ok) {
        const notice = $("notice");
        notice.textContent = message;
        notice.className = "notice show " + (ok ? "ok" : "bad");
        clearTimeout(showNotice.timer);
        if (ok) showNotice.timer = setTimeout(() => notice.className = "notice", 2400);
      }

      function showMediaNotice(message, ok) {
        const notice = $("mediaNotice");
        notice.textContent = message;
        notice.className = message ? "notice show " + (ok ? "ok" : "bad") : "notice";
      }

      function handleInvalidField(event) {
        const field = event.target;
        if (!field?.id) return;
        const message = field.validationMessage || "Check this field.";
        revealField(field.id);
        setFieldError(field.id, message);
        showNotice(message, false);
        updateFormStatus(message, "bad");
      }

      function formatApiError(body, status) {
        const fieldErrors = body?.details?.fieldErrors || {};
        const firstField = Object.keys(fieldErrors).find((key) => fieldErrors[key]?.length);
        if (firstField) {
          return labelForField(normalizeErrorField(firstField)) + ": " + fieldErrors[firstField][0];
        }
        if (status === 409) return "This campaign ID is already in use. Change the name or ID, or edit the existing campaign.";
        if (status === 404) return body?.error || "Data not found.";
        return body?.error || "Request failed (" + status + ")";
      }

      function clearFieldErrors() {
        for (const node of document.querySelectorAll(".field-error")) {
          node.textContent = "";
          node.className = "field-error";
        }
        for (const node of document.querySelectorAll("[aria-invalid='true']")) {
          node.removeAttribute("aria-invalid");
          node.removeAttribute("aria-describedby");
        }
      }

      function showFieldErrors(details) {
        const fieldErrors = details?.fieldErrors || {};
        let firstField = "";
        for (const [field, messages] of Object.entries(fieldErrors)) {
          if (!messages?.length) continue;
          const uiField = normalizeErrorField(field);
          setFieldError(uiField, messages[0]);
          if (!firstField) firstField = uiField;
        }
        if (firstField === "dmSteps") {
          $("dmStepPanel").open = true;
          $("addDmStepButton").focus();
          return;
        }
        if (firstField && $(firstField)) {
          revealField(firstField);
          $(firstField).focus();
        }
      }

      function revealField(fieldId) {
        if (fieldId === "mediaId") {
          $("postPickerPanel").open = true;
          void ensureMediaLoaded();
        }
        if (["campaignId", "mediaId", "buttonPayload"].includes(fieldId)) {
          document.querySelector(".advanced-panel").open = true;
        }
        const field = $(fieldId);
        const details = field?.closest?.("details");
        if (details) details.open = true;
      }

      function setFieldError(field, message) {
        const ids = field === "mediaId"
          ? ["mediaIdError", "mediaIdAdvancedError"]
          : field === "dmSteps"
            ? ["dmStepsError"]
            : [field + "Error"];
        const input = field === "dmSteps" ? $("dmStepPanel") : $(field);
        if (input) {
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", ids.join(" "));
        }
        for (const id of ids) {
          const node = $(id);
          if (!node) continue;
          node.textContent = message;
          node.className = "field-error show";
        }
      }

      function normalizeErrorField(field) {
        if (field === "id") return "campaignId";
        if (field === "texts") return "openingTextVariants";
        if (field === "dmSteps") return "dmSteps";
        return field;
      }

      function labelForField(field) {
        const labels = {
          id: "Campaign ID",
          campaignId: "Campaign ID",
          mediaId: "Post ID",
          name: "Campaign name",
          keyword: "Trigger word or phrase",
          openingText: "Opening DM",
          openingTextVariants: "Opening DM variants",
          dmSteps: "Additional DM steps",
          deliveryText: "Final prompt or link",
          commentReplyText: "Public reply",
          openingFailureReplyText: "Reply when the DM fails",
          commentReplyTextVariants: "Public reply variants",
          followGateEnabled: "Follow gate",
          followGateText: "Follow-gate message",
          followGateButtonTitle: "Follow-gate button",
          buttonTitle: "Button",
          buttonPayload: "Button payload"
        };
        return labels[field] || field;
      }

      function renderTemplateLibraries() {
        renderTemplateLibrary("opening", "openingTemplateSearch", "openingTemplateList", "openingTextVariants", "openingText");
        renderTemplateLibrary("comment_reply", "commentReplyTemplateSearch", "commentReplyTemplateList", "commentReplyTextVariants", "commentReplyText");
      }

      function renderTemplateLibrary(kind, searchId, listId, textareaId, primaryId) {
        const list = $(listId);
        const query = $(searchId).value.trim().toLowerCase();
        const current = new Set(collectVariantPool($(primaryId).value, $(textareaId).value));
        const templates = state.templates
          .filter((template) => template.kind === kind)
          .filter((template) => !query || template.text.toLowerCase().includes(query))
          .slice(0, 30);
        list.textContent = "";
        if (!templates.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = query ? "No matching templates." : "No templates yet.";
          list.append(empty);
          return;
        }

        for (const template of templates) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "template-chip" + (current.has(template.text) ? " active" : "");
          button.textContent = truncate(template.text, 72);
          button.title = template.text;
          button.addEventListener("click", () => {
            const latest = new Set(collectVariantPool($(primaryId).value, $(textareaId).value));
            if (latest.has(template.text)) {
              showNotice("This template is already in the campaign.", true);
              return;
            }
            appendVariantLine(textareaId, template.text);
            renderTemplateLibraries();
            markDirty();
          });
          list.append(button);
        }
      }

      async function saveTemplatesFromForm(kind) {
        const textareaId = kind === "opening" ? "openingTextVariants" : "commentReplyTextVariants";
        const primaryId = kind === "opening" ? "openingText" : "commentReplyText";
        const button = kind === "opening" ? $("saveOpeningTemplatesButton") : $("saveCommentReplyTemplatesButton");
        const variants = collectVariantPool($(primaryId).value, $(textareaId).value);
        if (!variants.length) return showNotice("There are no variants to save.", false);
        if (!confirm("Save " + variants.length + " templates to the library?\\n\\nThis does not save campaign changes.")) return;
        button.disabled = true;
        try {
          await adminFetch("/admin/variant-templates/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, texts: variants })
          });
          await loadVariantTemplates();
          renderTemplateLibraries();
          showNotice("Template library saved. Save the campaign if it has changes.", true);
        } catch (error) {
          const textErrors = error.details?.fieldErrors?.texts;
          if (textErrors?.length) {
            const message = kind === "comment_reply"
              ? "A public reply in the library exceeds 300 characters. Check the lines that are too long."
              : textErrors[0];
            setFieldError(textareaId, message);
            $(textareaId).focus();
          }
          showNotice(error.message || "Failed to save templates.", false);
        } finally {
          button.disabled = false;
        }
      }

      function appendVariantLine(textareaId, text) {
        const textarea = $(textareaId);
        const variants = collectVariantPool("", textarea.value);
        if (variants.includes(text)) return;
        textarea.value = [...variants, text].join("\\n");
      }

      function setSaveState(text, tone) {
        $("saveState").textContent = text;
        $("saveState").className = "pill " + tone;
      }

      function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (!state.csrfToken) return;
        inactivityTimer = setTimeout(async () => {
          await revokeSession();
          clearToken();
          showLoginNotice("The dashboard was locked due to inactivity.", false);
        }, INACTIVITY_TIMEOUT_MS);
      }

      function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
      }

      // Upstream values are only ever rendered as link targets when they are https URLs.
      function safeHttpsUrl(value) {
        if (typeof value !== "string" || !value) return "";
        try {
          return new URL(value).protocol === "https:" ? value : "";
        } catch {
          return "";
        }
      }
    </script>
  </body>
</html>`;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
