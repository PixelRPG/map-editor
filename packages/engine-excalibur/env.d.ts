import "../excalibur/src/engine/env";
import "../excalibur/src/engine/files";
import "../excalibur/src/engine/globals";

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
    declare const process: NodeJS.Process;
    declare const require: (path: string) => any;
}
