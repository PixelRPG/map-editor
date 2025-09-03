import { RpcEndpoint } from '@pixelrpg/message-channel-gjs'
import {
  RpcEngineType,
  RpcEngineParamMap,
  EngineRpcRegistry,
} from '@pixelrpg/engine-core'
import { WebView } from '../widgets/webview.ts'

/**
 * Service that bridges the GJS UI with the engine state for map editing
 */
export class MapEditorService {
  private get rpc(): RpcEndpoint<EngineRpcRegistry> {
    if (!this._webView) {
      throw new Error('WebView not set')
    }
    return this._webView.rpc
  }

  private _webView?: WebView

  /**
   * Current editor state
   */
  private currentState = {
    tool: null as 'brush' | 'eraser' | 'fill' | null,
    tileId: null as number | null,
    layerId: null as string | null,
  }

  /**
   * Create a new MapEditorService
   * @param webView The WebView instance to communicate with the engine
   */
  constructor(webView: WebView) {
    this.webView = webView
  }

  /**
   * Set the WebView instance
   * @param webView The WebView instance
   */
  set webView(webView: WebView) {
    this.removeRpcHandlers()
    this._webView = webView
    this.setupRpcHandlers()
  }

  /**
   * Set up RPC handlers for communication with the engine
   */
  private setupRpcHandlers(): void {
    if (!this.rpc) {
      console.warn(
        '[MapEditorService] RPC endpoint not available, skipping handler setup',
      )
      return
    }

    // Handle tile clicked events from engine
    this.rpc.registerHandler(RpcEngineType.TILE_CLICKED, (params) => {
      console.log('[MapEditorService] Tile clicked:', params)
      return { success: true }
    })

    // Handle tile hovered events from engine
    this.rpc.registerHandler(RpcEngineType.TILE_HOVERED, (params) => {
      console.log('[MapEditorService] Tile hovered:', params)
      return { success: true }
    })

    // Handle tile placed events from engine
    this.rpc.registerHandler(RpcEngineType.TILE_PLACED, (params) => {
      console.log('[MapEditorService] Tile placed:', params)
      return { success: true }
    })
  }

  private removeRpcHandlers(): void {
    // Check _webView directly to avoid calling the getter before it's set
    if (!this._webView) {
      return
    }

    try {
      this.rpc.unregisterHandler(RpcEngineType.TILE_CLICKED)
      this.rpc.unregisterHandler(RpcEngineType.TILE_HOVERED)
      this.rpc.unregisterHandler(RpcEngineType.TILE_PLACED)
    } catch (error) {
      // Ignore errors during cleanup - the handlers might not be registered
      console.debug(
        '[MapEditorService] Error during RPC handler cleanup:',
        error,
      )
    }
  }

  /**
   * Update the engine state with current editor state
   */
  private updateEngineState(): void {
    if (!this.rpc) {
      console.warn(
        '[MapEditorService] No RPC endpoint available for state update',
      )
      return
    }

    const stateUpdate: RpcEngineParamMap[RpcEngineType.EDITOR_STATE_CHANGED] = {
      tool: this.currentState.tool,
      tileId: this.currentState.tileId,
      layerId: this.currentState.layerId,
    }

    console.log('[MapEditorService] Updating engine state:', stateUpdate)

    // Send the state update to the engine via RPC
    this.rpc.sendNotification(RpcEngineType.EDITOR_STATE_CHANGED, stateUpdate)
  }

  /**
   * Set the current editing tool
   * @param tool The tool to set ('brush', 'eraser', 'fill', or null)
   */
  setTool(tool: 'brush' | 'eraser' | 'fill' | null): void {
    console.log(`[MapEditorService] Setting tool to: ${tool}`)
    this.currentState.tool = tool
    this.updateEngineState()
  }

  /**
   * Select a tile for placement
   * @param tileId The tile ID to select (null to deselect)
   */
  selectTile(tileId: number | null): void {
    console.log(`[MapEditorService] Selecting tile: ${tileId}`)
    this.currentState.tileId = tileId
    this.updateEngineState()
  }

  /**
   * Set the current layer
   * @param layerId The layer ID to set
   */
  setLayer(layerId: string | null): void {
    console.log(`[MapEditorService] Setting layer to: ${layerId}`)
    this.currentState.layerId = layerId
    this.updateEngineState()
  }

  /**
   * Get the current editor state
   */
  getCurrentState() {
    return { ...this.currentState }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.rpc) {
      this.rpc.destroy()
    }
  }
}
