const redisClient = require('../redis')

const rateLimiter = (seconds, limit) => async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress

  try {
    const response = await redisClient
      .multi()
      .incr(ip)
      .expire(ip, seconds)
      .exec()

    const [incrResponse, expireResponse] = response

    if (incrResponse[1] > limit) {
      next(
        new CustomError(
          'You have reached the rate limit. Please wait a moment before trying again.',
          422
        )
      )
    } else {
      next()
    }
  } catch (err) {
    next(err)
  }
}

module.exports = rateLimiter
