import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSacctJson, parseSinfoFormat, parseSinfoJson, parseSqueueFormat, parseSqueueJson } from '../parser.js'
import { buildSbatchCommand, buildScancelCommand, buildSinfoCommand, buildSqueueCommand } from '../commands.js'
import { detectSlurmJsonSupport, resetJsonSupportCache } from '../detector.js'

const SINFO_JSON_SAMPLE = JSON.stringify({
  nodes: [
    {
      name: 'node01',
      state: 'idle',
      cpus: 64,
      alloc_cpus: 32,
      real_memory: 256000,
      alloc_memory: 128000,
      gres: 'gpu:4',
      gres_used: 'gpu:2(IDX:0,1)',
      partitions: ['gpu', 'gpu_high'],
    },
    {
      node_name: 'node02',
      state: 'allocated',
      cpu_tot: 32,
      alloc_cpus: 16,
      real_memory: 128000,
      alloc_memory: 64000,
      gres: 'gpu:2',
      gres_used: 'gpu:1(IDX:0)',
      partitions: ['gpu'],
    },
  ],
})

const SQUEUE_JSON_SAMPLE = JSON.stringify({
  jobs: [
    {
      job_id: 12345,
      name: 'train_bert',
      job_state: 'RUNNING',
      partition: 'gpu',
      node_count: { number: 2 },
      tres_req_str: 'cpu=16,gres/gpu=4',
      run_time_str: '01:30:00',
      time_limit_str: '24:00:00',
    },
    {
      id: 12346,
      name: 'eval_job',
      state: 'PENDING',
      partition: 'gpu',
      num_nodes: 1,
      tres_req_str: 'cpu=8',
      run_time: '00:00:00',
      time_limit: '02:00:00',
    },
  ],
})

const SACCT_JSON_SAMPLE = JSON.stringify({
  associations: [
    {
      account: 'research',
      max_jobs: { number: 10 },
      running_jobs: 4,
      max_tres_run_mins: { cpu: 1024 },
      used_tres: { cpu: 256, gres_gpu: 6 },
      max_tres: { gres_gpu: 8 },
    },
  ],
})

describe('sinfo JSON 解析', () => {
  it('解析有效的 sinfo JSON 输出', () => {
    const nodes = parseSinfoJson(SINFO_JSON_SAMPLE)

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      nodeName: 'node01',
      state: 'idle',
      cpuTotal: 64,
      cpuUsed: 32,
      memTotal: 256000,
      memUsed: 128000,
      gpuTotal: 4,
      gpuUsed: 2,
      partitions: ['gpu', 'gpu_high'],
    })
    expect(nodes[1].nodeName).toBe('node02')
    expect(nodes[1].cpuTotal).toBe(32)
  })

  it('sinfo JSON 缺少 nodes 时返回空数组', () => {
    expect(parseSinfoJson(JSON.stringify({}))).toEqual([])
  })

  it('parseSinfoJson 接收无效 JSON 时抛出错误', () => {
    expect(() => parseSinfoJson('not valid json')).toThrow(/JSON|json/i)
  })
})

describe('squeue JSON 解析', () => {
  it('解析有效的 squeue JSON 输出', () => {
    const jobs = parseSqueueJson(SQUEUE_JSON_SAMPLE)

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      jobId: '12345',
      name: 'train_bert',
      state: 'RUNNING',
      partition: 'gpu',
      nodes: 2,
      gpus: 4,
      timeUsed: '01:30:00',
      timeLimit: '24:00:00',
    })
    expect(jobs[1].jobId).toBe('12346')
    expect(jobs[1].gpus).toBe(0)
  })

  it('parseSqueueJson 接收无效 JSON 时抛出错误', () => {
    expect(() => parseSqueueJson('{invalid}')).toThrow()
  })
})

describe('sacct JSON 解析', () => {
  it('解析有效的 sacct JSON 输出', () => {
    const quotas = parseSacctJson(SACCT_JSON_SAMPLE)

    expect(quotas).toEqual([
      {
        account: 'research',
        maxJobs: 10,
        runningJobs: 4,
        maxCpus: 1024,
        usedCpus: 256,
        maxGpus: 8,
        usedGpus: 6,
      },
    ])
  })
})

describe('文本格式降级解析', () => {
  it('parseSinfoFormat 支持带表头文本', () => {
    const text = `NODELIST STATE CPU MEMORY PARTITION
node01 idle 64 256000 gpu
node02 allocated 32 128000 gpu`

    expect(parseSinfoFormat(text)).toEqual([
      {
        nodeName: 'node01',
        state: 'idle',
        cpuTotal: 64,
        cpuUsed: 0,
        memTotal: 256000,
        memUsed: 0,
        gpuTotal: 0,
        gpuUsed: 0,
        partitions: ['gpu'],
      },
      {
        nodeName: 'node02',
        state: 'allocated',
        cpuTotal: 32,
        cpuUsed: 0,
        memTotal: 128000,
        memUsed: 0,
        gpuTotal: 0,
        gpuUsed: 0,
        partitions: ['gpu'],
      },
    ])
  })

  it('parseSqueueFormat 支持无表头文本', () => {
    const text = `12345 gpu train_bert 2 RUNNING 01:30:00 24:00:00`

    expect(parseSqueueFormat(text)).toEqual([
      {
        jobId: '12345',
        name: 'train_bert',
        state: 'RUNNING',
        partition: 'gpu',
        nodes: 2,
        gpus: 0,
        timeUsed: '01:30:00',
        timeLimit: '24:00:00',
      },
    ])
  })
})

describe('命令构建', () => {
  it('buildSbatchCommand 构建完整命令', () => {
    expect(
      buildSbatchCommand('train.sh', {
        partition: 'gpu',
        nodes: 2,
        gpus: 4,
        time: '24:00:00',
        jobName: 'train-bert',
        output: 'logs/out.txt',
        error: 'logs/err.txt',
      }),
    ).toBe(
      'sbatch --partition=gpu --nodes=2 --gres=gpu:4 --time=24:00:00 --job-name=train-bert --output=logs/out.txt --error=logs/err.txt train.sh',
    )
  })

  it('buildSbatchCommand 无选项时只有脚本路径', () => {
    expect(buildSbatchCommand('train.sh')).toBe('sbatch train.sh')
  })

  it('构建 sinfo/squeue/scancel 命令', () => {
    expect(buildSinfoCommand(true)).toBe('sinfo --json')
    expect(buildSinfoCommand(false)).toBe('sinfo --format="%N %T %c %m %P" --noheader')
    expect(buildSqueueCommand('alice', true)).toBe('squeue --json --user=alice')
    expect(buildSqueueCommand(undefined, false)).toBe('squeue --format="%i %P %j %D %T %M %l" --noheader')
    expect(buildScancelCommand('12345')).toBe('scancel 12345')
  })
})

describe('JSON 支持检测', () => {
  beforeEach(() => {
    resetJsonSupportCache()
  })

  it('缓存首次检测结果', async () => {
    const exec = vi.fn(async () => ({ stdout: '{"nodes":[]}', stderr: '', exitCode: 0 }))

    await expect(detectSlurmJsonSupport(exec)).resolves.toBe(true)
    await expect(detectSlurmJsonSupport(exec)).resolves.toBe(true)
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('检测失败时返回 false', async () => {
    const exec = vi.fn(async () => {
      throw new Error('unsupported')
    })

    await expect(detectSlurmJsonSupport(exec)).resolves.toBe(false)
  })
})
