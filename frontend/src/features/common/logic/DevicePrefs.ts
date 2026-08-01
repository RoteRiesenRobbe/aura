/**
 * Browser-local UI preferences. Not an account, and never sent anywhere.
 *
 * ⚑ This is the honest half of what used to be `features/accounts/Account.ts`,
 * whose docstring claimed to hold an account "as long as accounts are not
 * persisted in the backend". Three of its four properties never were an
 * account: they are device settings that stay device settings **after**
 * persistence ships, because they describe this browser rather than this
 * player. The fourth, `playerName`, was retired outright — see PlayerName.ts.
 *
 * ⚑ The split is not cosmetic (plan-accounts-frontend.md §4c).
 * `plan-accounts-schema.md` §Naming makes `accounts` the server-side identity
 * table; leaving a client class called `Account` that stores fullscreen state
 * and dev-panel coordinates would recreate, on the client, exactly the
 * ambiguity that rename existed to remove.
 */

export class DevicePrefs {
    static get fullScreen(): boolean {
        return getBoolean('fullScreen', false);
    }

    static set fullScreen(enabled: boolean) {
        setValue('fullScreen', String(enabled));
    }

    static get rawGameSettings(): string | null {
        return getString('gameSettings', null);
    }

    static set rawGameSettings(json: string) {
        setValue('gameSettings', json);
    }

    static get developPanelPositionX(): number | null {
        return getInt('developPanel.position.x', null);
    }

    static set developPanelPositionX(x: number) {
        setValue('developPanel.position.x', String(x));
    }

    static get developPanelPositionY(): number | null {
        return getInt('developPanel.position.y', null);
    }

    static set developPanelPositionY(y: number) {
        setValue('developPanel.position.y', String(y));
    }
}

function getString(key: string, defaultValue: string | null = ''): string | null {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value;
}

function getBoolean(key: string, defaultValue: boolean | null = false): boolean | null {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return (value === 'true');
}

function getInt(key: string, defaultValue: number | null = 0): number {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return parseInt(value, 10);
}

function setValue(key: string, value: string) {
    if (value) {
        localStorage.setItem(key, value);
    } else {
        localStorage.removeItem(key);
    }
}
