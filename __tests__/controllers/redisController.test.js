const CustomError = require('../../controllers/errorController')
const rateLimiter = require('../../helpers/rateLimiter')
const { incrementAndExpire } = require('../../helpers/redisHelpers')

jest.mock('../../redis', () => ({
  redisClient: {
    on: jest.fn(),
    quit: jest.fn(),
  },
}))

jest.mock('../../helpers/redisHelpers', () => ({
  incrementAndExpire: jest.fn(),
}))

const mockReq = () => ({
  ip: '192.168.1.1',
  connection: {
    remoteAddress: '192.168.1.1',
  },
})

const mockRes = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn()
  return res
}

const mockNext = jest.fn()

describe('rateLimiter Middleware', () => {
  const seconds = 60
  const limit = 5
  let req, res, next

  beforeEach(() => {
    req = mockReq()
    res = mockRes()
    next = mockNext
    jest.clearAllMocks()
  })

  it('should call next if the rate limit is not exceeded', async () => {
    incrementAndExpire.mockResolvedValueOnce([
      [null, 3],
      [null, 1],
    ])

    await rateLimiter(seconds, limit)(req, res, next)

    expect(incrementAndExpire).toHaveBeenCalledWith(req.ip, seconds)
    expect(next).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalledWith(expect.any(CustomError))
  })

  it('should call next with a CustomError if the rate limit is exceeded', async () => {
    incrementAndExpire.mockResolvedValueOnce([
      [null, 6],
      [null, 1],
    ])

    await rateLimiter(seconds, limit)(req, res, next)

    expect(incrementAndExpire).toHaveBeenCalledWith(req.ip, seconds)
    expect(next).toHaveBeenCalledWith(expect.any(CustomError))
    expect(next.mock.calls[0][0].statusCode).toBe(422)
    expect(next.mock.calls[0][0].message).toBe(
      'You have reached the rate limit. Please wait a moment before trying again.'
    )
  })

  it('should call next with an error if Redis operation fails', async () => {
    incrementAndExpire.mockRejectedValueOnce(new Error('Redis error'))

    await rateLimiter(seconds, limit)(req, res, next)

    expect(incrementAndExpire).toHaveBeenCalledWith(req.ip, seconds)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(next.mock.calls[0][0].message).toBe('Redis error')
  })
})

afterAll(() => {
  const { redisClient } = require('../../redis')
  redisClient.quit()
})
