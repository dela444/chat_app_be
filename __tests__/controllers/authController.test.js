const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const {
  userValidationCheck,
  isUsernameTaken,
} = require('../../controllers/authController')
const CustomError = require('../../controllers/errorController')
const { userValidationSchema } = require('../../helpers/validationHelpers')
const { registerUser } = require('../../controllers/authController')
const {
  storeUsersToRedis,
  storeUserToRedis,
} = require('../../helpers/redisHelpers')
const { login } = require('../../controllers/authController')
const { isUserAuthenticated } = require('../../controllers/authController')
require('dotenv').config()

jest.mock('../../helpers/validationHelpers', () => ({
  userValidationSchema: {
    validate: jest.fn(),
  },
}))

jest.mock('../../redis', () => ({
  redisClient: {
    on: jest.fn(),
    quit: jest.fn(),
    hset: jest.fn(),
    rpush: jest.fn(),
  },
}))

jest.mock('../../config', () => ({
  pool: {
    query: jest.fn(),
  },
}))

jest.mock('bcrypt')

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}))

jest.mock('../../helpers/redisHelpers', () => ({
  storeUserToRedis: jest.fn(),
  storeUsersToRedis: jest.fn(),
}))

const mockReq = (headers, body) => ({
  headers: headers || {},
  body: body || {},
})

const mockRes = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn()
  return res
}

const mockNext = jest.fn()

describe('Auth Controller Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('userValidationCheck Middleware', () => {
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })
    it('should call next with no arguments if validation passes', async () => {
      userValidationSchema.validate.mockResolvedValueOnce()

      const req = mockReq(
        {},
        {
          username: 'validUsername',
          password: 'validPassword123',
        }
      )

      await userValidationCheck(req, res, next)

      expect(userValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with CustomError if validation fails', async () => {
      const validationError = new Error('Validation failed')
      userValidationSchema.validate.mockRejectedValueOnce(validationError)

      const req = mockReq(
        {},
        {
          username: 'invalid',
          password: 'short',
        }
      )

      await userValidationCheck(req, res, next)

      expect(userValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith(expect.any(CustomError))
      expect(next.mock.calls[0][0].statusCode).toBe(422)
      expect(next.mock.calls[0][0].message).toBe('Validation failed')
    })
  })

  describe('isUsernameTaken Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })

    it('should call next with no arguments if username is not taken', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] })

      const req = mockReq(
        {},
        {
          username: 'uniqueUsername',
        }
      )

      await isUsernameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [req.body.username]
      )
      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with CustomError if username is taken', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ username: 'takenUsername' }],
      })

      const req = mockReq(
        {},
        {
          username: 'takenUsername',
        }
      )

      await isUsernameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [req.body.username]
      )
      expect(next).toHaveBeenCalledWith(expect.any(CustomError))
      expect(next.mock.calls[0][0].statusCode).toBe(409)
      expect(next.mock.calls[0][0].message).toBe('Username is already taken!')
    })

    it('should call next with an error if query fails', async () => {
      const queryError = new Error('Query failed')
      pool.query.mockRejectedValueOnce(queryError)

      const req = mockReq(
        {},
        {
          username: 'anyUsername',
        }
      )

      await isUsernameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [req.body.username]
      )
      expect(next).toHaveBeenCalledWith(queryError)
    })
  })

  describe('registerUser Middleware', () => {
    const { pool } = require('../../config')
    let req, res, next

    beforeEach(() => {
      req = mockReq(null, { username: 'newUser', password: 'password123' })
      res = mockRes()
      next = mockNext
      jest.clearAllMocks()
    })

    it('should register a user and return a token', async () => {
      bcrypt.hash.mockResolvedValueOnce('hashedPassword')

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'newUser', user_id: 'uuid-v4' }],
      })

      jwt.sign.mockReturnValueOnce('fakeJwtToken')

      storeUsersToRedis.mockResolvedValueOnce()
      storeUserToRedis.mockResolvedValueOnce()

      await registerUser(req, res, next)

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10)
      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_users (username, password, user_id) VALUES ($1, $2, $3) RETURNING id, username, user_id;`,
        ['newUser', 'hashedPassword', expect.any(String)]
      )
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          username: 'newUser',
          id: 1,
          userid: 'uuid-v4',
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      )
      expect(storeUsersToRedis).toHaveBeenCalledWith({
        user_id: 'uuid-v4',
        username: 'newUser',
      })
      expect(storeUserToRedis).toHaveBeenCalledWith({
        user_id: 'uuid-v4',
        username: 'newUser',
      })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({
        success: true,
        token: 'fakeJwtToken',
        username: 'newUser',
      })
    })

    it('should call next with an error if bcrypt fails', async () => {
      const bcryptError = new Error('Bcrypt error')
      bcrypt.hash.mockRejectedValueOnce(bcryptError)

      await registerUser(req, res, next)

      expect(next).toHaveBeenCalledWith(bcryptError)
    })

    it('should call next with an error if query fails', async () => {
      bcrypt.hash.mockResolvedValueOnce('hashedPassword')
      const queryError = new Error('Query failed')
      pool.query.mockRejectedValueOnce(queryError)

      await registerUser(req, res, next)

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10)
      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_users (username, password, user_id) VALUES ($1, $2, $3) RETURNING id, username, user_id;`,
        ['newUser', 'hashedPassword', expect.any(String)]
      )
      expect(next).toHaveBeenCalledWith(queryError)
    })

    it('should call next with an error if jwt.sign fails', async () => {
      bcrypt.hash.mockResolvedValueOnce('hashedPassword')
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'newUser', user_id: 'uuid-v4' }],
      })
      const jwtError = new Error('JWT sign error')
      jwt.sign.mockImplementation(() => {
        throw jwtError
      })

      await registerUser(req, res, next)

      expect(next).toHaveBeenCalledWith(jwtError)
    })

    it('should call next with an error if storeUserToRedis fails', async () => {
      bcrypt.hash.mockResolvedValueOnce('hashedPassword')
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'newUser', user_id: 'uuid-v4' }],
      })
      jwt.sign.mockReturnValueOnce('fakeJwtToken')
      storeUsersToRedis.mockResolvedValueOnce()
      storeUserToRedis.mockRejectedValueOnce(
        new Error('Redis storeUserToRedis error')
      )

      await registerUser(req, res, next)

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10)
      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_users (username, password, user_id) VALUES ($1, $2, $3) RETURNING id, username, user_id;`,
        ['newUser', 'hashedPassword', expect.any(String)]
      )
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          username: 'newUser',
          id: 1,
          userid: 'uuid-v4',
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      )
      expect(storeUserToRedis).toHaveBeenCalledWith({
        user_id: 'uuid-v4',
        username: 'newUser',
      })

      expect(next).toHaveBeenCalledWith(
        new Error('Redis storeUserToRedis error')
      )
    })

    it('should call next with an error if storeUsersToRedis fails', async () => {
      bcrypt.hash.mockResolvedValueOnce('hashedPassword')
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'newUser', user_id: 'uuid-v4' }],
      })
      jwt.sign.mockReturnValueOnce('fakeJwtToken')
      storeUsersToRedis.mockRejectedValueOnce(
        new Error('Redis storeUsersToRedis error')
      )
      storeUserToRedis.mockResolvedValueOnce()

      await registerUser(req, res, next)

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10)
      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_users (username, password, user_id) VALUES ($1, $2, $3) RETURNING id, username, user_id;`,
        ['newUser', 'hashedPassword', expect.any(String)]
      )
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          username: 'newUser',
          id: 1,
          userid: 'uuid-v4',
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      )
      expect(storeUsersToRedis).toHaveBeenCalledWith({
        user_id: 'uuid-v4',
        username: 'newUser',
      })
      expect(next).toHaveBeenCalledWith(
        new Error('Redis storeUsersToRedis error')
      )
    })
  })

  describe('isUserAuthenticated Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })

    it('should authenticate user and return user data if token is valid and user exists', async () => {
      const token = 'validToken'
      const decoded = { username: 'testuser' }

      jwt.verify.mockImplementation((token, secret, callback) =>
        callback(null, decoded)
      )

      pool.query.mockResolvedValueOnce({
        rows: [{ username: 'testuser' }],
      })

      const req = mockReq({
        authorization: `Bearer ${token}`,
      })

      await isUserAuthenticated(req, res, next)

      expect(jwt.verify).toHaveBeenCalledWith(
        token,
        process.env.JWT_SECRET,
        expect.any(Function)
      )
      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [decoded.username]
      )
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({
        authenticated: true,
        token,
        username: 'testuser',
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('should call next with CustomError if Authorization header is missing or invalid', async () => {
      const req = mockReq()

      await isUserAuthenticated(req, res, next)

      expect(next).toHaveBeenCalledWith(
        new CustomError('Invalid Authorization header', 401)
      )
    })

    it('should call next with error if token is invalid', async () => {
      const token = 'invalidToken'

      jwt.verify.mockImplementation((token, secret, callback) =>
        callback(new Error('Token error'), null)
      )

      const req = mockReq({
        authorization: `Bearer ${token}`,
      })

      await isUserAuthenticated(req, res, next)

      expect(jwt.verify).toHaveBeenCalledWith(
        token,
        process.env.JWT_SECRET,
        expect.any(Function)
      )
      expect(next).toHaveBeenCalledWith(new Error('Token error'))
    })

    it('should call next with CustomError if user does not exist', async () => {
      const token = 'validToken'
      const decoded = { username: 'testuser' }

      jwt.verify.mockImplementation((token, secret, callback) =>
        callback(null, decoded)
      )

      pool.query.mockResolvedValueOnce({
        rows: [],
      })

      const req = mockReq({
        authorization: `Bearer ${token}`,
      })

      await isUserAuthenticated(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [decoded.username]
      )
      expect(next).toHaveBeenCalledWith(
        new CustomError('User does not exist!', 401)
      )
    })

    it('should call next with error if query fails', async () => {
      const token = 'validToken'
      const decoded = { username: 'testuser' }
      const queryError = new Error('Query failed')

      jwt.verify.mockImplementation((token, secret, callback) =>
        callback(null, decoded)
      )

      pool.query.mockRejectedValueOnce(queryError)

      const req = mockReq({
        authorization: `Bearer ${token}`,
      })

      await isUserAuthenticated(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_users WHERE username = $1;`,
        [decoded.username]
      )
      expect(next).toHaveBeenCalledWith(queryError)
    })
  })

  describe('login Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
      jest.clearAllMocks()
    })
    it('should return a token and success message if login is successful', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'testpassword',
        }
      )

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            user_id: 'user-1',
            username: 'testuser',
            password: 'hashedpassword',
          },
        ],
      })

      bcrypt.compare.mockResolvedValueOnce(true)
      jwt.sign.mockReturnValueOnce('fakeJwtToken')
      storeUserToRedis.mockResolvedValueOnce()

      await login(req, res, next)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({
        success: true,
        token: 'fakeJwtToken',
        username: 'testuser',
      })
    })

    it('should call next with CustomError if password is invalid', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'wrongpassword',
        }
      )

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            user_id: 'user-1',
            username: 'testuser',
            password: 'hashedpassword',
          },
        ],
      })

      bcrypt.compare.mockResolvedValueOnce(false)

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(
        new CustomError('Wrong username or password!', 401)
      )
    })

    it('should call next with CustomError if username does not exist', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'testpassword',
        }
      )

      pool.query.mockResolvedValueOnce({ rows: [] })

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(
        new CustomError('Wrong username or password!', 401)
      )
    })

    it('should call next with an error if bcrypt fails', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'testpassword',
        }
      )

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            password: 'hashedPassword',
            user_id: 'uuid-v4',
          },
        ],
      })

      bcrypt.compare.mockRejectedValueOnce(new Error('bcrypt failed'))

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(new Error('bcrypt failed'))
    })

    it('should call next with an error if jwt fails', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'testpassword',
        }
      )

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            password: 'hashedPassword',
            user_id: 'uuid-v4',
          },
        ],
      })

      bcrypt.compare.mockResolvedValueOnce(true)
      jwt.sign.mockImplementationOnce(() => {
        throw new Error('jwt failed')
      })

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(new Error('jwt failed'))
    })

    it('should call next with an error if query fails', async () => {
      const req = mockReq(
        {},
        {
          username: 'testuser',
          password: 'testpassword',
        }
      )

      pool.query.mockRejectedValueOnce(new Error('Query failed'))

      await login(req, res, next)

      expect(next).toHaveBeenCalledWith(new Error('Query failed'))
    })
  })
})

afterAll(() => {
  const { redisClient } = require('../../redis')
  redisClient.quit()
})
