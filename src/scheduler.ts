import Redis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'

const redis = new Redis()

async function ensureIndex() {
  console.log('Ensuring RedisSearch index "gistwiz:job"...')

  try {
    await redis.call(
      'FT.CREATE',
      'gistwiz:job',
      'ON',
      'HASH',
      'PREFIX',
      '1',
      'gistwiz:job:',
      'SCHEMA',
      'status',
      'TAG',
      'created',
      'NUMERIC',
      'updated',
      'NUMERIC'
    )
    console.log('RedisSearch index "gistwiz:job" created successfully.')
  } catch (error: any) {
    if (error.message.includes('Index already exists')) {
      console.log('RedisSearch index "gistwiz:job" already exists.')
    } else {
      console.error('Error during RedisSearch index creation:', error)
    }
  }
}

async function resetMetrics() {
  const defaultMetrics = {
    pending_jobs: 0,
    running_jobs: 0,
    successful_jobs: 0,
    failed_jobs: 0,
    total_jobs: 0,
  }

  await redis.hset('gistwiz:job:metrics', defaultMetrics)
  console.log('Metrics reset to default values.')
}

async function incrementMetric(metric: string, increment: number) {
  await redis.hincrby('gistwiz:job:metrics', metric, increment)
}

async function addDefaultSchedule() {
  const scheduleKey = 'gistwiz:job:schedule:wilmoore'
  const exists = await redis.exists(scheduleKey)

  if (exists) {
    console.log('Default schedule for user "wilmoore" already exists.')
    return
  }

  const now = Date.now()
  const defaultSchedule = {
    plan: '10s',
    content: JSON.stringify({ token: 'ghp_default_token' }),
    recurring: true,
    last_run: 0,
    created: now,
    updated: now,
  }

  await redis.hset(scheduleKey, defaultSchedule)
  console.log('Default schedule for user "wilmoore" added.')
}

async function scheduleJobs() {
  const schedules = await redis.keys('gistwiz:job:schedule:*')

  for (const scheduleKey of schedules) {
    const schedule = await redis.hgetall(scheduleKey)
    const now = Date.now()

    if (schedule.recurring === 'true' && now - parseInt(schedule.last_run) >= parseInterval(schedule.plan)) {
      const jobId = `${now}-${uuidv4().slice(0, 10)}`
      const jobKey = `gistwiz:job:${jobId}`

      await redis.hset(jobKey, {
        content: schedule.content,
        created: now,
        updated: now,
        status: 'pending',
      })

      await redis.lpush('gistwiz:job:queue', jobId)

      // Update metrics for new jobs
      await incrementMetric('pending_jobs', 1)
      await incrementMetric('total_jobs', 1)

      await redis.hset(scheduleKey, { last_run: now })
      console.log(`Scheduled job ${jobId} for schedule ${scheduleKey}`)
    }
  }
}

function parseInterval(plan: string): number {
  const units = { s: 1000, m: 60000, h: 3600000 }
  const unit = plan.slice(-1)
  const value = parseInt(plan.slice(0, -1))
  return value * (units[unit] || 1000)
}

async function main() {
  console.log('Scheduler started')
  await resetMetrics() // Reset metrics on startup
  await ensureIndex()
  await addDefaultSchedule()

  setInterval(scheduleJobs, 5000) // Check every 5 seconds
}

main()