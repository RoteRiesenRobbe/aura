/**
 * The ☰ toggle's breadcrumb (plan-ui-pass.md C4b D3, plan-appearance.md C5c):
 * on the phone the ☰ is the extra hop into more than one panel, so it pulses
 * while ANY of them has something unseen. Each panel sets its own flag, so
 * one panel's trail clearing can never put out another's.
 */
const owners = new Set<string>();

export function setMenuBreadcrumb(owner: string, on: boolean) {
    if (on) {
        owners.add(owner);
    } else {
        owners.delete(owner);
    }
    document.getElementById('mobileMenuButton')?.classList.toggle('breadcrumb', owners.size > 0);
}
