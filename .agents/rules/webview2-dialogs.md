---
trigger: always_on
description: "Desktop WebView2 and Electron UI interaction invariants: complete prohibition of native modal dialogs and enforcement of two-step inline confirmations"
---

# Safety Invariant 5: Desktop WebView2 & Electron UI Interaction Standards

## Core Avoidance Mechanism
Prevent silent action drops, UI thread freezes, and aborted workflows in desktop hosts (such as Magpie Microsoft Edge WebView2 and Electron desktop shells) by completely prohibiting synchronous native browser dialogs (`window.confirm()`, `window.alert()`, `window.prompt()`) and enforcing accessible two-step inline confirmations and non-blocking modals.

---

## 1. Zero Native Browser Dialogs Invariant
- **Strict Prohibition**: NEVER execute `window.confirm()`, `window.alert()`, or `window.prompt()` in any frontend interface code (`page/app.js`, `page/index.html`).
- **Why Desktop WebViews Break Synchronous Dialogs**:
  - **Default Dialog Suppression**: Desktop WebView2 controls (`CoreWebView2`) suppress synchronous JavaScript modal dialogs by default unless the native host application implements custom Win32 `ScriptDialogOpening` event handlers.
  - **Silent Action Cancellation**: When `window.confirm()` is called inside Magpie WebView2, the control suppresses the popup and immediately returns `false` synchronously. Any destructive user operation (such as disconnecting an agent or deleting a project) silently fails without feedback, confusing developers.
  - **UI Thread Freezes**: In embedded desktop environments, invoking synchronous script dialogs from an asynchronous event loop blocks the UI thread's Win32 message pump, deadlocking the desktop window.

---

## 2. Two-Step Inline Confirmation Standard
All destructive operations (such as disconnecting an agent, removing a project, or purging bridge links) MUST use a non-blocking, two-step inline confirmation pattern with an automatic reset timer:

```
[ Step 0: Idle ]      ──(Click 1)──>   [ Step 1: Confirming ]   ──(Click 2)──>   [ Step 2: Executing ]
Text: "Remove"                          Text: "Click to Confirm"                  Text: "Removing..."
Style: default                          Style: #ef4444 bold                       Disabled: true
Timer: none                             Timer: 4000ms active                      Action: Async API Call
                                               │
                                        (Timeout: 4000ms)
                                               ▼
                                       [ Step 0: Idle ]
```

### Reference Implementation (`page/app.js:1204-1218`, `1350-1364`):
```javascript
let confirmTimer = null;

button.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Step 1: Enter inline confirmation state
  if (button.dataset.confirming !== "true") {
    button.dataset.confirming = "true";
    button.textContent = "Click to Confirm";
    button.style.color = "#ef4444";
    button.style.fontWeight = "bold";

    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      delete button.dataset.confirming;
      button.textContent = "Remove";
      button.style.color = "";
      button.style.fontWeight = "";
    }, 4000);
    return;
  }

  // Step 2: Confirmed execution
  if (confirmTimer) clearTimeout(confirmTimer);
  delete button.dataset.confirming;
  button.disabled = true;
  button.textContent = "Removing...";

  try {
    await performAction();
  } finally {
    button.disabled = false;
    button.textContent = "Remove";
  }
});
```

---

## 3. Non-Blocking Validation & Error Notifications
1. **Inline Field Validation**: Replace `alert("Please provide ...")` with inline visual helper messages or red borders adjacent to invalid form fields (e.g., adding `.field-error` CSS class).
2. **Transient Toast Notifications**: Display transient status and error alerts using DOM toast banners that automatically fade out after 3 to 5 seconds without blocking user interaction.
3. **Custom HTML Modals**: For multi-field forms or complex user prompts (e.g., "Add Custom Agent" or "Configure Component Paths"), render DOM overlay modals (`<div class="modal">...</div>`) containing explicit "Cancel" and "Save" buttons.
