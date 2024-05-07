import './global.d.ts';

const handler = window.webkit.messageHandlers.pixelrpg;
if (!handler) {
    throw new Error("No handler found");
}

handler.postMessage({
    type: "hello",
    message: "Hello from client"
});