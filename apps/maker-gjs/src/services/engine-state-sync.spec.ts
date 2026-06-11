import { describe, expect, it } from '@gjsify/unit'
import type { EditorTool } from '@pixelrpg/engine'

import {
  type AssistantEngineSink,
  type EditorUiState,
  type EditorViewStateSink,
  RESYNCED_WIN_ACTIONS,
  syncEngineState,
} from './engine-state-sync.ts'

/** Recording fakes — capture every push a fresh engine would receive. */
function createRecorder() {
  const calls: Array<[string, ...unknown[]]> = []
  const view: EditorViewStateSink = {
    setActiveTool: (tool: EditorTool) => void calls.push(['setActiveTool', tool]),
    setObjectsVisible: (visible: boolean) => void calls.push(['setObjectsVisible', visible]),
    setShowGrid: (showGrid: boolean) => void calls.push(['setShowGrid', showGrid]),
    setDimInactiveLayers: (dim: boolean) => void calls.push(['setDimInactiveLayers', dim]),
  }
  const assistant: AssistantEngineSink = {
    setAssistantPaused: (paused: boolean) => void calls.push(['setAssistantPaused', paused]),
    setAssistantInfo: (name: string, color: string) => void calls.push(['setAssistantInfo', name, color]),
    setFollowAssistant: (follow: boolean) => void calls.push(['setFollowAssistant', follow]),
  }
  return { calls, view, assistant }
}

const FULL_STATE: EditorUiState = {
  tool: 'eraser',
  objectsVisible: false,
  showGrid: true,
  dimInactiveLayers: true,
  assistant: { present: true, name: 'Claude', color: '#3584e4', paused: true },
  followAssistant: true,
}

export default async () => {
  await describe('RESYNCED_WIN_ACTIONS (engine-recreation re-push list)', async () => {
    await it('documents the full set of stateful win.* actions that survive engine recreation', async () => {
      // win.play is intentionally absent — it is reset to false on
      // scene-editor exit instead of re-pushed (fresh scenes start in
      // editor mode). win.mode / win.share-session never reach the engine.
      expect([...RESYNCED_WIN_ACTIONS]).toStrictEqual([
        'set-tool',
        'toggle-objects',
        'toggle-grid',
        'toggle-transparency',
        'toggle-assistant-paused',
      ])
    })
  })

  await describe('syncEngineState', async () => {
    await it('re-pushes EVERY window-owned state into a fresh engine (the pause survives re-entry)', async () => {
      const { calls, view, assistant } = createRecorder()
      syncEngineState(view, assistant, FULL_STATE)
      expect(calls).toStrictEqual([
        ['setActiveTool', 'eraser'],
        ['setObjectsVisible', false],
        ['setShowGrid', true],
        ['setDimInactiveLayers', true],
        ['setAssistantPaused', true],
        ['setAssistantInfo', 'Claude', '#3584e4'],
        ['setFollowAssistant', true],
      ])
    })

    await it('skips the tool push when no tool action state exists yet', async () => {
      const { calls, view, assistant } = createRecorder()
      syncEngineState(view, assistant, { ...FULL_STATE, tool: null })
      expect(calls.some(([name]) => name === 'setActiveTool')).toBe(false)
    })

    await it('does not push assistant identity when the assistant is absent (no presence resurrection)', async () => {
      const { calls, view, assistant } = createRecorder()
      syncEngineState(view, assistant, {
        ...FULL_STATE,
        assistant: { present: false, name: 'Claude', color: '#3584e4', paused: false },
      })
      expect(calls.some(([name]) => name === 'setAssistantInfo')).toBe(false)
      // The pause flag is still pushed — it must hold even before the
      // assistant announces itself.
      expect(calls.some(([name]) => name === 'setAssistantPaused')).toBe(true)
    })
  })
}
