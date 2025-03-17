import { RpcEndpoint, IframeContext } from '@pixelrpg/message-channel-web';
import { LoadProjectRequest, LoadProjectResponse } from './types';

// Konstante für den Projekt-Pfad
const PROJECT_PATH = 'http://localhost:5001/game-project.json';

// DOM-Elemente
const loadButton = document.getElementById('loadProjectBtn') as HTMLButtonElement;
const gameIframe = document.getElementById('game-iframe') as HTMLIFrameElement;

// RPC-Endpunkt für die Kommunikation mit dem iframe
let rpc: RpcEndpoint | null = null;

/**
 * Initialisiert die Anwendung
 */
function init() {
    console.log('Initializing maker-web app');

    // RPC-Endpunkt erstellen
    rpc = RpcEndpoint.getInstance('pixelrpg', {
        context: IframeContext.PARENT,
        targetIframe: gameIframe,
        targetOrigin: '*'
    });

    // TODO: Make this type safe
    rpc.registerHandler('notifyEngineEvent', (event: any) => {
        console.log('Engine event:', event);
    });

    // TODO: Make this type safe
    rpc.registerHandler('handleInputEvent', (event: any) => {
        console.log('Input event:', event);
    });

    // Button-Klick-Handler registrieren
    loadButton.addEventListener('click', loadProject);
}

/**
 * Lädt das Projekt in die Engine
 */
async function loadProject() {
    if (!rpc) {
        console.error('RPC endpoint not initialized');
        return;
    }

    try {
        console.log('Loading project:', PROJECT_PATH);

        // Anfrage an die Engine senden
        const response = await rpc.sendRequest<LoadProjectRequest, LoadProjectResponse>(
            'loadProject',
            { projectPath: PROJECT_PATH }
        );

        // Ergebnis verarbeiten
        if (response.success) {
            console.log('Project loaded successfully');
        } else {
            console.error('Failed to load project:', response.error);
        }
    } catch (error) {
        console.error('Error loading project:', error);
    }
}

// App initialisieren, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', init);
