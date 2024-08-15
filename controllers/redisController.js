const redisClient = require('../redis')

const rateLimiter = (seconds, limit, isAuth) => async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress

  const response = await redisClient.multi().incr(ip).expire(ip, seconds).exec()

  const [incrResponse, expireResponse] = response

  if (incrResponse[1] > limit) {
    if (isAuth) {
      res.send({
        authenticated: false,
        message:
          'You have reached the rate limit. Please wait a moment before trying again.',
      })
    } else {
      res.send({
        success: false,
        message:
          'You have reached the rate limit. Please wait a moment before trying again.',
      })
    }
  } else {
    next()
  }
}

module.exports = rateLimiter
