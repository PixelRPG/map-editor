// Bundled by validate-project.mjs; the shim import MUST stay first (see check:test-globals).
import '@pixelrpg/engine/node-test-globals'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { GameProjectFormat } from '../../packages/engine/src/format/GameProjectFormat.ts'
import { MapFormat } from '../../packages/engine/src/format/MapFormat.ts'
import { SpriteSetFormat } from '../../packages/engine/src/format/SpriteSetFormat.ts'

const projectPath = process.argv[2]
if (!projectPath) throw new Error('usage: validate-project <game-project.json>')
const root = dirname(resolve(projectPath))
const project = GameProjectFormat.deserialize(readFileSync(projectPath, 'utf8'))
GameProjectFormat.validate(project)
for (const ref of project.maps) {
  MapFormat.validate(MapFormat.deserialize(readFileSync(resolve(root, ref.path), 'utf8')))
}
for (const ref of project.spriteSets) {
  SpriteSetFormat.deserialize(readFileSync(resolve(root, ref.path), 'utf8'))
}
console.log(`engine validators: ok (${project.maps.length} map(s), ${project.spriteSets.length} sprite set(s))`)
