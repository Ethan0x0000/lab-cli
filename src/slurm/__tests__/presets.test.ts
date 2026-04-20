import { describe, it, expect } from 'vitest'
import { getPreset, getPresetOptions, listPresets, type PresetName } from '../presets.js'

describe('presets', () => {
  describe('getPreset', () => {
    it('should return preset info for debug', () => {
      const preset = getPreset('debug')
      expect(preset).toEqual({
        name: 'debug',
        description: '调试用（1 GPU，1小时）',
        gpus: 1,
        nodes: 1,
        time: '1:00:00',
      })
    })

    it('should return preset info for single-gpu', () => {
      const preset = getPreset('single-gpu')
      expect(preset).toEqual({
        name: 'single-gpu',
        description: '单 GPU 训练（1 GPU，24小时）',
        gpus: 1,
        nodes: 1,
        time: '24:00:00',
      })
    })

    it('should return preset info for multi-gpu', () => {
      const preset = getPreset('multi-gpu')
      expect(preset).toEqual({
        name: 'multi-gpu',
        description: '多 GPU 训练（4 GPU，48小时）',
        gpus: 4,
        nodes: 1,
        time: '48:00:00',
      })
    })

    it('should return preset info for full-node', () => {
      const preset = getPreset('full-node')
      expect(preset).toEqual({
        name: 'full-node',
        description: '整节点训练（8 GPU，72小时）',
        gpus: 8,
        nodes: 1,
        time: '72:00:00',
      })
    })

    it('should return undefined for unknown preset', () => {
      const preset = getPreset('unknown')
      expect(preset).toBeUndefined()
    })
  })

  describe('getPresetOptions', () => {
    it('should return SbatchOptions for debug without description or name', () => {
      const options = getPresetOptions('debug')
      expect(options).toEqual({
        gpus: 1,
        nodes: 1,
        time: '1:00:00',
      })
      expect(options).not.toHaveProperty('description')
      expect(options).not.toHaveProperty('name')
    })

    it('should return SbatchOptions for single-gpu without description or name', () => {
      const options = getPresetOptions('single-gpu')
      expect(options).toEqual({
        gpus: 1,
        nodes: 1,
        time: '24:00:00',
      })
      expect(options).not.toHaveProperty('description')
      expect(options).not.toHaveProperty('name')
    })

    it('should return SbatchOptions for multi-gpu without description or name', () => {
      const options = getPresetOptions('multi-gpu')
      expect(options).toEqual({
        gpus: 4,
        nodes: 1,
        time: '48:00:00',
      })
      expect(options).not.toHaveProperty('description')
      expect(options).not.toHaveProperty('name')
    })

    it('should return SbatchOptions for full-node without description or name', () => {
      const options = getPresetOptions('full-node')
      expect(options).toEqual({
        gpus: 8,
        nodes: 1,
        time: '72:00:00',
      })
      expect(options).not.toHaveProperty('description')
      expect(options).not.toHaveProperty('name')
    })

    it('should return undefined for unknown preset', () => {
      const options = getPresetOptions('unknown')
      expect(options).toBeUndefined()
    })

    it('should not include partition field', () => {
      const options = getPresetOptions('debug')
      expect(options).not.toHaveProperty('partition')
    })
  })

  describe('listPresets', () => {
    it('should return array of all presets', () => {
      const presets = listPresets()
      expect(presets).toHaveLength(4)
    })

    it('should include all preset names', () => {
      const presets = listPresets()
      const names = presets.map((p) => p.name)
      expect(names).toContain('debug')
      expect(names).toContain('single-gpu')
      expect(names).toContain('multi-gpu')
      expect(names).toContain('full-node')
    })

    it('should include descriptions for all presets', () => {
      const presets = listPresets()
      presets.forEach((preset) => {
        expect(preset.description).toBeDefined()
        expect(preset.description.length).toBeGreaterThan(0)
      })
    })

    it('should have correct resource values', () => {
      const presets = listPresets()
      const debugPreset = presets.find((p) => p.name === 'debug')
      expect(debugPreset?.gpus).toBe(1)
      expect(debugPreset?.nodes).toBe(1)
      expect(debugPreset?.time).toBe('1:00:00')
    })

    it('should not include partition in returned presets', () => {
      const presets = listPresets()
      presets.forEach((preset) => {
        expect(preset.partition).toBeUndefined()
      })
    })
  })

  describe('PresetName type', () => {
    it('should accept valid preset names', () => {
      const names: PresetName[] = ['debug', 'single-gpu', 'multi-gpu', 'full-node']
      names.forEach((name) => {
        expect(getPreset(name)).toBeDefined()
      })
    })
  })
})
