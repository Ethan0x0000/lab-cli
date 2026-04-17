import { z } from 'zod'

export const globalConfigSchema = z.object({
  host: z.string().min(1, '服务器地址不能为空'),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1, '用户名不能为空'),
  authMethod: z.enum(['key', 'password']),
  privateKeyPath: z.string().optional(),
  defaultPartition: z.string().optional(),
  defaultRemotePath: z.string().min(1, '默认远程路径不能为空'),
})

export const projectConfigSchema = z.object({
  name: z.string().min(1, '项目名不能为空'),
  remotePath: z.string().min(1, '远程路径不能为空'),
  syncExclude: z.array(z.string()).default([
    'node_modules',
    '.git',
    '__pycache__',
    '*.pyc',
    '.env',
    'dist',
    'coverage',
    '.sisyphus',
  ]),
  slurmPartition: z.string().optional(),
  slurmGpus: z.number().int().min(1).optional(),
  slurmNodes: z.number().int().min(1).optional(),
  condaEnvName: z.string().optional(),
  condaPythonVersion: z.string().default('3.10'),
})

export type GlobalConfigInput = z.input<typeof globalConfigSchema>
export type ProjectConfigInput = z.input<typeof projectConfigSchema>
