/* ─────────────────────────────────────────────────────────────────
   BackgroundCanvas — DECOMMISSIONED in the broadsheet · ii redesign.

   The old animated arc canvas does not match the broadsheet
   aesthetic (which uses a fixed offset-litho dot texture on the
   body, defined in styles/global.css → body::before).

   This component is kept as an empty render so existing imports
   in App.tsx and elsewhere continue to compile while PR-A lands.
   It will be removed entirely in PR-C cleanup.
   ───────────────────────────────────────────────────────────────── */
export default function BackgroundCanvas() {
  return null
}
