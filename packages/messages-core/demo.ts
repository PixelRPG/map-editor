// Demo of the MessageData and MessageChannel API
import { WindowMessageChannel } from "./src/index.ts";

// Enum for message types (demonstrates type-safe messages)
enum DemoMessageType {
    GREETING = "greeting",
    UPDATE = "update",
    ERROR = "error"
}

// Concrete implementation of WindowMessageChannel for demo
class DemoChannel extends WindowMessageChannel<DemoMessageType> {
    protected targetWindow: Window = window;
    protected targetOrigin: string = "*";

    constructor() {
        super("demo-channel");
    }
}

// Example usage
function runDemo() {
    const channel = new DemoChannel();

    // Standard DOM event handler approach
    channel.onmessage = (event) => {
        console.log("Received raw message event:", event);
    };

    // Type-specific event handling (payload-only)
    channel.on(DemoMessageType.GREETING, (payload) => {
        console.log("Received greeting:", payload);
    });

    channel.on(DemoMessageType.UPDATE, (payload) => {
        console.log("Received update:", payload);
    });

    channel.on(DemoMessageType.ERROR, (payload) => {
        console.error("Received error:", payload);
    });

    // Send a message - much simpler than before!
    channel.postMessage(DemoMessageType.GREETING, { message: "Hello, world!" });

    // Later we can send an update
    setTimeout(() => {
        channel.postMessage(DemoMessageType.UPDATE, {
            status: "active",
            timestamp: new Date().toISOString()
        });
    }, 1000);
}

// Only run in browser environments
if (typeof window !== "undefined") {
    runDemo();
}

export { DemoChannel, DemoMessageType, runDemo }; 