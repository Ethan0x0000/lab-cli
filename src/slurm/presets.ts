import type { SbatchOptions } from './commands.js'

export type PresetName = 'debug' | 'single-gpu' | 'multi-gpu' | 'full-node'

export interface PresetInfo {
  name: string
  description: string
  partition?: string
  gpus: number
  nodes: number
  time: string
}

const PRESETS = {
  debug: {
    name: 'debug',
    description: '调试用（1 GPU，1小时）',
    gpus: 1,
    nodes: 1,
    time: '1:00:00',
  },
  'single-gpu': {
    name: 'single-gpu',
    description: '单 GPU 训练（1 GPU，24小时）',
    gpus: 1,
    nodes: 1,
    time: '24:00:00',
  },
  'multi-gpu': {
    name: 'multi-gpu',
    description: '多 GPU 训练（4 GPU，48小时）',
    gpus: 4,
    nodes: 1,
    time: '48:00:00',
  },
  'full-node': {
    name: 'full-node',
    description: '整节点训练（8 GPU，72小时）',
    gpus: 8,
    nodes: 1,
    time: '72:00:00',
  },
} as const

export function getPreset(name: string): PresetInfo | undefined {
  const preset = PRESETS[name as PresetName]
  if (!preset) return undefined
  return {
    name: preset.name,
    description: preset.description,
    gpus: preset.gpus,
    nodes: preset.nodes,
    time: preset.time,
  }
}

export function getPresetOptions(name: string): SbatchOptions | undefined {
  const preset = PRESETS[name as PresetName]
  if (!preset) return undefined
  return {
    gpus: preset.gpus,
    nodes: preset.nodes,
    time: preset.time,
  }
}

export function listPresets(): PresetInfo[] {
  return Object.values(PRESETS).map((preset) => ({
    name: preset.name,
    description: preset.description,
    gpus: preset.gpus,
    nodes: preset.nodes,
    time: preset.time,
  }))
}
