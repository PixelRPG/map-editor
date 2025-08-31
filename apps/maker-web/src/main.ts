import { RpcEndpoint, IframeContext } from '@pixelrpg/message-channel-web'
import { RpcEngineType, EngineRpcRegistry } from '@pixelrpg/engine-core'

// Constant for the project path
const PROJECT_PATH = 'http://localhost:5001/game-project.json'

// DOM elements
const loadButton = document.getElementById(
  'loadProjectBtn',
) as HTMLButtonElement
const testButton = document.getElementById('testRpcBtn') as HTMLButtonElement
const gameIframe = document.getElementById('game-iframe') as HTMLIFrameElement

// RPC endpoint for communication with the iframe
let rpc: RpcEndpoint<EngineRpcRegistry> | null = null

/**
 * Initialize the application
 */
function init() {
  console.log('Initializing maker-web app')

  // Wait for iframe to load before creating RPC endpoint
  gameIframe.onload = () => {
    console.log('Iframe loaded, creating RPC endpoint')

    // Create RPC endpoint
    rpc = RpcEndpoint.getInstance<EngineRpcRegistry>('pixelrpg', {
      context: IframeContext.PARENT,
      targetIframe: gameIframe,
      targetOrigin: '*',
    })

    console.log('RPC endpoint created for parent context')
  }

  // Register button click handlers
  loadButton.addEventListener('click', loadProject)
  testButton.addEventListener('click', testRpcConnection)
}

/**
 * Load the project into the engine
 */
async function loadProject() {
  if (!rpc) {
    console.error('RPC endpoint not initialized')
    return
  }

  console.log('Loading project:', PROJECT_PATH)

  try {
    // Send request to the engine
    console.log('Sending RPC request to iframe...')
    const response = await rpc.sendRequest(RpcEngineType.LOAD_PROJECT, {
      projectPath: PROJECT_PATH,
      options: {
        preloadAllSpriteSets: true,
        preloadAllMaps: false,
        initialMapId: 'kokiri-forest',
      },
    })

    console.log('Received RPC response:', response)

    // Process result
    if (response.success) {
      console.log('Project loaded successfully')
    } else {
      // Error is always a string according to RpcResponse type
      const errorMessage = response.error || 'Unknown error'

      console.error('Failed to load project:', errorMessage)

      // If you need error codes in the future, extend the RpcResponse type
      // to support structured errors like WireRpcResponse.error
    }
  } catch (error) {
    console.error('RPC request failed:', error)
  }
}

/**
 * Test RPC connection to iframe
 */
async function testRpcConnection() {
  console.log('Testing RPC connection...')

  if (!rpc) {
    console.error('RPC endpoint not initialized')
    return
  }

  try {
    console.log('Sending test ping...')
    // Try to send a simple request that should always work
    const response = await rpc.sendRequest(RpcEngineType.START, undefined)
    console.log('RPC test successful:', response)
  } catch (error) {
    console.error('RPC test failed:', error)
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init)
