import "../excalibur/src/engine/env";
import "../excalibur/src/engine/files";
import "../excalibur/src/engine/globals";
import "../message-channel-webview/src/env";
import "@pixelrpg/message-channel-webview/env"
import type { Engine } from "./src/engine.ts";
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

    interface Window {
        engine: Engine;
    }
}
