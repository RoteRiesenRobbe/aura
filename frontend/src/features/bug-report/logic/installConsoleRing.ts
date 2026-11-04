// Side effect only: index.ts imports this FIRST (plan-bug-report.md L4), so the
// bug report's console buffer hears boot and bake errors too.
import {installConsoleRing} from './ConsoleRing';

installConsoleRing();
