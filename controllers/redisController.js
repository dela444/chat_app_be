const { incrementAndExpire } = require('../helpers/redisHelpers')
const redisClient = require('../redis')
const CustomError = require('./errorController')

const rateLimiter = (seconds, limit) => async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress

  try {
    const response = await incrementAndExpire(ip, seconds)

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
