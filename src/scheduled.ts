import Redis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import ms from 'ms'

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
    pending: 0,
    running: 0,
    success: 0,
    failure: 0,
    counter: 0,
  }

  await redis.hset('gistwiz:job:metrics', defaultMetrics)
  console.log('Metrics reset to default values.')
}

async function incrementMetric(metric: string, increment: number) {
  await redis.hincrby('gistwiz:job:metrics', metric, increment)
}

async function addSchedules() {
  const scheduleId = 'gistwiz:scheduled:wilmoore'
  const exists = await redis.exists(scheduleId)

  if (exists) {
    console.log('schedule "wilmoore" already exists.')
    return
  }

  const now = Date.now()
  const schedule = {
    content: JSON.stringify({ token: 'ghp_demo_token' }),
    interval: '10s',
    recurring: true,
    last_run: 0,
    created: now,
    updated: now,
  }

  await redis.hset(scheduleId, schedule)
  console.log('Default schedule for user "wilmoore" added.')
}

async function scheduleJobs() {
  const schedules = await redis.keys('gistwiz:scheduled:*')

  for (const scheduleId of schedules) {
    const schedule = await redis.hgetall(scheduleId)
    const now = Date.now()

    if (schedule.recurring === 'true' && now - parseInt(schedule.last_run) >= ms(schedule.interval)) {
      const jobId = `${now}-${uuidv4().slice(0, 10)}`
      const jobKey = `gistwiz:job:${jobId}`

      await redis.hset(jobKey, {
        content: schedule.content,
        created: now,
        updated: now,
        status: 'pending',
      })

      await redis.lpush('gistwiz:job:gists', jobId)

      // Update metrics for new jobs
      await incrementMetric('pending', 1)
      await incrementMetric('counter', 1)

      await redis.hset(scheduleId, { last_run: now })
      console.log(`Scheduled job ${jobId} for schedule ${scheduleId}`)
    }
  }
}

async function main() {
  console.log('Scheduler started')
  await resetMetrics() // Reset metrics on startup
  await ensureIndex()
  await addSchedules()

  setInterval(scheduleJobs, 5000) // Check every 5 seconds
}

main()