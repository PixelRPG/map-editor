import "../excalibur/src/engine/env";
import "../excalibur/src/engine/files";
import "../excalibur/src/engine/globals";
import "../messages-web/src/env";

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            __EX_VERSION: string;
            NODE_ENV: string;
        }
        interface Process {
            env: ProcessEnv;
        }
    }
    interface Window {
        webkit: any | undefined; // TODO
    }
    declare const process: NodeJS.Process;
    declare const require: (path: string) => any;
}
