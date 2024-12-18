import Redis from 'ioredis'

const redis = new Redis()

async function incrementMetric(metric: string, increment: number) {
  await redis.hincrby('gistwiz:job:metrics', metric, increment)
}

async function processJobs() {
  console.log('Worker started')

  while (true) {
    const jobId = await redis.rpop('gistwiz:job:gists')

    if (!jobId) {
      console.log('No jobs found. Worker idle.')
      await new Promise(resolve => setTimeout(resolve, 5000))
      continue
    }

    const jobKey = `gistwiz:job:${jobId}`
    const jobData = await redis.hgetall(jobKey)

    if (!jobData.content) {
      console.error(`Job ${jobId} not found or corrupted. Marking as failed.`)
      await redis.hset(jobKey, { status: 'failure', updated: Date.now() })
      await incrementMetric('failure', 1)
      continue
    }

    const jobContent = JSON.parse(jobData.content)

    try {
      console.log(`Processing job ${jobId} with content:`, jobContent)

      // Update metrics for job processing
      await incrementMetric('pending', -1)
      await incrementMetric('running', 1)

      // Simulate work (replace this with actual logic)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mark job as success
      await redis.hset(jobKey, { status: 'success', updated: Date.now() })
      await incrementMetric('running', -1)
      await incrementMetric('success', 1)

      console.log(`Job ${jobId} completed successfully`)
    } catch (error) {
      console.error(`Job ${jobId} failed`, error)

      // Mark job as failed
      await redis.hset(jobKey, { status: 'failure', updated: Date.now() })
      await incrementMetric('running', -1)
      await incrementMetric('failure', 1)
    }
  }
}

processJobs()