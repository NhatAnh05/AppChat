# UI Hotfix: duplicate React siblings and history layout

## Root cause and changes

`ChatWindow.tsx` rendered `MessageList` and `MessageInput` as siblings using the same React key. On rerenders, stale lists/composers could remain mounted. In a Chromium harness using the actual React components and Redux, 45 mock messages produced 135 DOM rows and 3 history viewports before separating the keys. After changing the keys to `history:...` and `composer:...`, only one history viewport with 45 rows remained.

- Keep unique semantic keys per account and conversation, without changing API messages or deleting server records.
- Use a single scrolling history viewport, normal-flow grid rows and responsive media frames. Remove the header's backdrop blur and avoid forced paint layers.
- Coalesce resize-driven scrolling with requestAnimationFrame, preserve manual page anchors and avoid moving the reader on new messages when they are reading older history.
- Show GIF attachments as images if the uploaded MIME type or existing safe URL indicates GIF. Keep metadata and the original file URL. Use the active media parser before the legacy parser for sidebar previews.
- Use synchronous upload guards to avoid starting overlapping upload actions in the same composer. This does not change the server's limit of 10 concurrent uploads.
- Keep all P0 authentication, storage limits and WebSocket contracts unchanged. No changes to dependencies.

## Verification in the patch environment

- Node tests: 253 passed, 0 failed, 0 skipped (3 new regression tests).
- TypeScript `tsc -b`: passed.
- ESLint: passed, no reported warnings or errors.
- Chromium component harness with actual ChatWindow, MessageList, MessageItem, MediaAttachment, MessageInput and Redux: 45 sample messages, 8 GIFs; 1648x900, 1280x720, 768x800, 390x844. No overlapping row rectangles or media overflow. Scroll position preserved on realtime append while reading older messages, followed bottom when already at bottom. No teacher API was used in this test.
- Vite bundling: not verified in the patch environment, because the supplied node_modules contains Windows Rolldown native bindings rather than Linux bindings.

## Apply on Windows

Stop AppChat, extract patch into the project root, overwrite the listed source files, then run:

```powershell
cd "D:\Desktop\AppChat"
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd run dev:full -- --local-media
```

Open the Vite URL and hard-refresh with Ctrl+F5. Check images, animated GIFs, PDF attachments, scrolling while sending, and switching conversations. The local-media sandbox is for non-sensitive same-machine test files only. Production media still requires the existing authenticated gateway.

If duplicate messages remain after reload, inspect actual server message IDs. Different server IDs are retained deliberately; the patch does not delete real messages from the teacher's server.
