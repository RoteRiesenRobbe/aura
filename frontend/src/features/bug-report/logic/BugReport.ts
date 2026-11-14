/**
 * The bug report (plan-bug-report.md BR1): the form in the settings panel
 * (D1) and the report panel it opens (D2, D9).
 *
 * ⚑ `pointerdown`, never `click` (L2, CLAUDE.md HUD event handling).
 * ⚑ Both textareas stop every key from reaching the game (L1), Escape
 *   included, so each one closes on Escape itself (L3).
 */
import '../assets/bugReport.less';
import * as Preloading from '../../core/logic/Preloading';
import * as PanelExclusivity from '../../user-interface/logic/PanelExclusivity';
import {preventShortcutPropagation, resetFocus} from '../../common/logic/Utils';
import {t} from '../../localization/logic/Locale';
import {AccountsApi, ApiError} from '../../accounts/logic/AccountsApi';
import {collectDiagnostics} from './Diagnostics';
import {buildBugReport, diagnosticsSection, SavedNote, SaveResult, savedCopyLine} from './ReportText';

/** D9 [PLACEHOLDER]. */
const COPIED_NOTE_MS = 2000;

/** D10: the longest the panel waits on the server copy [PLACEHOLDER]. */
const SAVE_WAIT_MS = 2000;

let panel: HTMLElement;
let reportText: HTMLTextAreaElement;
let copyStatus: HTMLElement;
let savedNote: HTMLElement;
let copyStatusTimer: ReturnType<typeof setTimeout>;

Preloading.renderPartial(require('../assets/bugReport.html'), onDomReady);

function onDomReady() {
    panel = document.getElementById('bugReportPanel');
    reportText = panel.querySelector('#bugReportText');
    copyStatus = panel.querySelector('#bugReportCopyStatus');
    savedNote = panel.querySelector('#bugReportSaved');

    panel.querySelectorAll('a, button, textarea').forEach(preventShortcutPropagation);
    onPress(panel.querySelector('#closeBugReport'), close);
    onPress(panel.querySelector('#doneBugReport'), close);
    onPress(panel.querySelector('#copyBugReport'), copy);
    onEscape(reportText, close);
    // Select all, BACKWARD: the caret lands at the start, so the browser keeps
    // the view at the top left instead of scrolling to the selection's end.
    reportText.addEventListener('focus', () => reportText.setSelectionRange(0, reportText.value.length, 'backward'));

    PanelExclusivity.register('bugReport', close);
}

function onPress(element: Element, action: () => void) {
    element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        action();
    });
}

function onEscape(element: Element, action: () => void) {
    element.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.code === 'Escape') {
            action();
        }
    });
}

/**
 * The form inside the settings panel (D1). Called from the settings panel's
 * own setup, which hands over its close function so this module need not
 * import it back.
 */
export function setupForm(settingsPanel: HTMLElement, closeSettings: () => void) {
    const openButton = settingsPanel.querySelector('#openBugReport');
    const form = settingsPanel.querySelector('#bugReportForm') as HTMLElement;
    const message = settingsPanel.querySelector('#bugReportMessage') as HTMLTextAreaElement;
    const generate = settingsPanel.querySelector('#generateBugReport') as HTMLButtonElement;

    [openButton, message, generate].forEach(preventShortcutPropagation);
    onEscape(message, closeSettings);

    onPress(openButton, () => {
        form.classList.remove('hidden');
        openButton.classList.add('hidden');
        message.focus();
    });

    onPress(generate, async () => {
        if (generate.disabled) {
            return;
        }
        generate.disabled = true;
        generate.textContent = t('bug-report.measuring');
        try {
            const diagnostics = await collectDiagnostics();
            const saved = savedCopyLine(await saveCopy(message.value, diagnosticsSection(diagnostics, false)));
            diagnostics.reportId = saved.reportId;
            savedNote.textContent = savedNoteText(saved.note, saved.reportId);
            open(buildBugReport(message.value, diagnostics));
            message.value = '';
            form.classList.add('hidden');
            openButton.classList.remove('hidden');
        } finally {
            generate.disabled = false;
            generate.textContent = t('bug-report.generate');
        }
    });
}

/**
 * D10: POST the copy, waiting at most SAVE_WAIT_MS. The panel opens either
 * way. ⚑ A copy that lands after the wait is still saved, only its id is not
 * shown; the Discord post then carries no id to match it by.
 */
async function saveCopy(message: string, diagnostics: string): Promise<SaveResult> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<SaveResult>((resolve) => {
        timer = setTimeout(() => resolve({failure: 'timeout'}), SAVE_WAIT_MS);
    });
    const post = AccountsApi.reportBug(message, diagnostics).then(
        ({id}): SaveResult => ({id}),
        (error): SaveResult => ({failure: error instanceof ApiError ? error.code : 'network'}),
    );
    try {
        return await Promise.race([post, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

function savedNoteText(note: SavedNote, id: string): string {
    switch (note) {
        case 'saved':
            return t('bug-report.saved', {id});
        case 'signed-out':
            return t('bug-report.not-saved.signed-out');
        case 'rate-limited':
            return t('bug-report.not-saved.rate-limited');
        case 'offline':
            return t('bug-report.not-saved.offline');
        case 'refused':
            return t('bug-report.not-saved.refused');
    }
}

function open(text: string) {
    // Opening shuts the rest of the family, the settings panel included.
    PanelExclusivity.notifyOpened('bugReport');
    reportText.value = text;
    copyStatus.textContent = '';
    panel.classList.remove('hidden');
    reportText.focus();
    reportText.scrollTop = 0;
    reportText.scrollLeft = 0;
}

/** X, DONE, Escape, and every family open. A no-op when shut. */
export function close() {
    if (!panel || panel.classList.contains('hidden')) {
        return;
    }
    panel.classList.add('hidden');
    resetFocus();
}

/**
 * D9: the async clipboard where the browser grants it, else the old
 * select-and-copy. ⚑ L7: the clipboard needs a secure context and a user
 * gesture; the fallback is not optional.
 */
async function copy() {
    let copied = false;
    try {
        await navigator.clipboard.writeText(reportText.value);
        copied = true;
    } catch {
        reportText.focus();
        reportText.select();
        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }
    }
    clearTimeout(copyStatusTimer);
    copyStatus.textContent = copied ? t('bug-report.copied') : t('bug-report.copy-failed');
    if (copied) {
        copyStatusTimer = setTimeout(() => (copyStatus.textContent = ''), COPIED_NOTE_MS);
    }
}
