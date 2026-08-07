import { type ReactNode, useEffect, useRef } from 'react'

/**
 * A bottom sheet that is modal to the keyboard as well as to the mouse.
 *
 * Two call sites — the match screen's card/square detail and the dex's entry
 * detail — declared `role="dialog" aria-modal="true"` and implemented none of
 * what that claims. The match screen's comment even argued the claim was honest
 * "in a way it is not on the draft sheet", on the grounds that this scrim
 * swallows the tap. That is true and it is beside the point: `aria-modal` tells
 * assistive technology that nothing outside this node is reachable, and a
 * pointer-events rule says nothing to a keyboard or a screen reader. Tab walked
 * straight out of the sheet and into the board behind it.
 *
 * So the claim is now implemented rather than retracted. Four things, which is
 * the whole of what `aria-modal` promises:
 *
 * 1. **Focus moves in** on open — to the sheet itself, not to its close button.
 *    Focusing the control that dismisses a thing before it has been read is the
 *    classic over-eager version, and it makes a screen reader announce "close"
 *    as the first word of the definition the child opened.
 * 2. **Tab is trapped**, wrapping at both ends.
 * 3. **Escape closes**, because a modal that can only be dismissed by finding
 *    its button is a trap for the one input method this exists to serve.
 * 4. **Focus is restored** to whatever opened it, so a player who peeks at a
 *    card from the hotbar lands back on that card rather than at the top of the
 *    document.
 *
 * Shared rather than duplicated: two copies of a focus trap is two things to get
 * wrong, and the second copy is where it rots.
 */

/** Everything focusable, in DOM order. `:not([disabled])` matters — a disabled
 *  close button would otherwise anchor the trap on a stop Tab skips. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  label,
  onClose,
  scrimTestId,
  children,
}: {
  /** The accessible name. Required — an unlabelled dialog is announced as
   *  "dialog" and nothing else. */
  label: string
  onClose: () => void
  scrimTestId: string
  children: ReactNode
}) {
  const sheet = useRef<HTMLDivElement>(null)
  /**
   * `onClose` behind a ref, so the effect below can depend on nothing.
   *
   * Both call sites pass an inline arrow (`onClose={() => setPeek(null)}`), so
   * its identity changes on every parent render — and the parent re-renders for
   * reasons that have nothing to do with this sheet: the rule banner's 3.2s
   * timeout, a clipboard promise resolving. Keyed on `[onClose]`, the effect
   * tore down and re-ran on each of those, which means cleanup put focus back on
   * the opener and setup pulled it into the sheet again, mid-read, with a screen
   * reader re-announcing the dialog each time. The ref keeps the handler current
   * without making the subscription depend on its identity.
   */
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    // Captured before focus moves, so it is the element that actually opened
    // the sheet rather than whatever the trap focused first.
    const opener = document.activeElement as HTMLElement | null
    sheet.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const node = sheet.current
      if (!node) return
      const stops = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      // A sheet with no focusable child still traps: focus stays on the sheet,
      // which is why it carries `tabIndex={-1}` and is focused on open.
      if (stops.length === 0) {
        event.preventDefault()
        node.focus()
        return
      }
      const first = stops[0]!
      const last = stops[stops.length - 1]!
      // Wrap at both ends. `document.activeElement` rather than `event.target`:
      // the two differ when focus sits on the sheet container itself.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Only when the opener is still in the document — a sheet whose opener
      // unmounted (a card that was spent, a room that was deleted) must not
      // throw on the way out.
      if (opener?.isConnected) opener.focus()
    }
    // Mount and unmount only — see the note on `close`. An empty dependency list
    // is the point, not an oversight.
  }, [])

  return (
    // The scrim swallows the tap; the sheet below swallows the keyboard. Both
    // halves are needed for `aria-modal` to be a true statement.
    <div className="sheet-scrim" data-testid={scrimTestId} onClick={onClose}>
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // Focusable but not tabbable: the trap needs somewhere to put focus on
        // open that is not a control, and no Tab stop of its own.
        tabIndex={-1}
        // A tap inside the sheet is not a tap on the scrim.
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
