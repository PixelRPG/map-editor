import { RpcEndpoint, IframeContext } from '@pixelrpg/message-channel-web'
import { LoadProjectRequest, LoadProjectResponse } from './types'
import { RpcEngineType, RpcEngineDataMap } from '@pixelrpg/engine-core'

// Konstante für den Projekt-Pfad
const PROJECT_PATH = 'http://localhost:5001/game-project.json'

// DOM-Elemente
const loadButton = document.getElementById(
  'loadProjectBtn',
) as HTMLButtonElement
const gameIframe = document.getElementById('game-iframe') as HTMLIFrameElement

// RPC-Endpunkt für die Kommunikation mit dem iframe
let rpc: RpcEndpoint | null = null

/**
 * Initialisiert die Anwendung
 */
function init() {
  console.log('Initializing maker-web app')

  // RPC-Endpunkt erstellen
  rpc = RpcEndpoint.getInstance('pixelrpg', {
    context: IframeContext.PARENT,
    targetIframe: gameIframe,
    targetOrigin: '*',
  })

  rpc.registerHandler(
    RpcEngineType.NOTIFY_ENGINE_EVENT,
    (
      event: RpcEngineDataMap[RpcEngineType.NOTIFY_ENGINE_EVENT] | undefined,
    ) => {
      if (!event) {
        console.error('Invalid engine event: undefined')
        return
      }
      console.log('Engine event:', event)
    },
  )

  rpc.registerHandler(
    RpcEngineType.HANDLE_INPUT_EVENT,
    (event: RpcEngineDataMap[RpcEngineType.HANDLE_INPUT_EVENT] | undefined) => {
      if (!event) {
        console.error('Invalid input event: undefined')
        return
      }
      console.log('Input event:', event)
    },
  )

  // Button-Klick-Handler registrieren
  loadButton.addEventListener('click', loadProject)
}

/**
 * Lädt das Projekt in die Engine
 */
async function loadProject() {
  if (!rpc) {
    console.error('RPC endpoint not initialized')
    return
  }

  try {
    console.log('Loading project:', PROJECT_PATH)

    // Anfrage an die Engine senden
    const response = await rpc.sendRequest<
      LoadProjectRequest,
      LoadProjectResponse
    >(RpcEngineType.LOAD_PROJECT, { projectPath: PROJECT_PATH })

    // Ergebnis verarbeiten
    if (response.success) {
      console.log('Project loaded successfully')
    } else {
      console.error('Failed to load project:', response.error)
    }
  } catch (error) {
    console.error('Error loading project:', error)
  }
}

// App initialisieren, wenn das DOM geladen ist
document.addEventListener('DOMContentLoaded', init)
