const {
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom,
  messageValidationCheck,
  createMessage,
} = require('../../controllers/chatController')
const {
  roomValidationSchema,
  messageValidationSchema,
} = require('../../helpers/validationHelpers')
const CustomError = require('../../controllers/errorController')
const { storeRoomsToRedis } = require('../../helpers/redisHelpers')

jest.mock('../../helpers/validationHelpers', () => ({
  roomValidationSchema: {
    validate: jest.fn(),
  },
  messageValidationSchema: {
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

jest.mock('../../helpers/redisHelpers', () => ({
  storeRoomsToRedis: jest.fn(),
}))

const mockReq = (body) => ({
  body: body || {},
})

const mockRes = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn()
  return res
}

const mockNext = jest.fn()

describe('Chat Controller Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  describe('roomValidationCheck Middleware', () => {
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })

    it('should call next with no arguments if validation passes', async () => {
      roomValidationSchema.validate.mockResolvedValueOnce()

      const req = mockReq({
        name: 'validName',
      })

      await roomValidationCheck(req, res, next)

      expect(roomValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with CustomError if validation fails', async () => {
      const validationError = new Error('Validation failed')
      roomValidationSchema.validate.mockRejectedValueOnce(validationError)

      const req = mockReq(
        {},
        {
          name: 'in',
        }
      )

      await roomValidationCheck(req, res, next)

      expect(roomValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith(expect.any(CustomError))
      expect(next.mock.calls[0][0].statusCode).toBe(422)
      expect(next.mock.calls[0][0].message).toBe('Validation failed')
    })
  })

  describe('isRoomNameTaken Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })

    it('should call next with no arguments if name is not taken', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] })

      const req = mockReq(
        {},
        {
          name: 'uniqueName',
        }
      )

      await isRoomNameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_rooms WHERE name = $1;`,
        [req.body.name]
      )
      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with CustomError if name is taken', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ username: 'takenName' }],
      })

      const req = mockReq(
        {},
        {
          username: 'takenName',
        }
      )

      await isRoomNameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_rooms WHERE name = $1;`,
        [req.body.name]
      )
      expect(next).toHaveBeenCalledWith(expect.any(CustomError))
      expect(next.mock.calls[0][0].statusCode).toBe(409)
      expect(next.mock.calls[0][0].message).toBe('Name is already taken!')
    })

    it('should call next with an error if query fails', async () => {
      const queryError = new Error('Query failed')
      pool.query.mockRejectedValueOnce(queryError)

      const req = mockReq(
        {},
        {
          name: 'anyName',
        }
      )

      await isRoomNameTaken(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `SELECT * FROM chat_rooms WHERE name = $1;`,
        [req.body.name]
      )
      expect(next).toHaveBeenCalledWith(queryError)
    })
  })

  describe('createChatRoom Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
      jest.clearAllMocks()
    })

    it('should create a chat room and store it in Redis', async () => {
      const req = mockReq({
        name: 'New Chat Room',
      })

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'New Chat Room',
            room_id: 'uuid-v4',
          },
        ],
      })
      storeRoomsToRedis.mockResolvedValueOnce()

      await createChatRoom(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_rooms (name, room_id) VALUES ($1, $2) RETURNING id, name, room_id;`,
        [req.body.name, expect.any(String)]
      )
      expect(storeRoomsToRedis).toHaveBeenCalledWith({
        room_id: 'uuid-v4',
        name: 'New Chat Room',
      })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({ success: true })
    })

    it('should call next with an error if query fails', async () => {
      const req = mockReq({
        name: 'New Chat Room',
      })

      pool.query.mockRejectedValueOnce(new Error('Query failed'))

      await createChatRoom(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_rooms (name, room_id) VALUES ($1, $2) RETURNING id, name, room_id;`,
        [req.body.name, expect.any(String)]
      )
      expect(storeRoomsToRedis).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(next.mock.calls[0][0].message).toBe('Query failed')
    })

    it('should call next with an error if storeRoomsToRedis fails', async () => {
      const req = mockReq({
        name: 'New Chat Room',
      })

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'New Chat Room',
            room_id: 'uuid-v4',
          },
        ],
      })
      storeRoomsToRedis.mockRejectedValueOnce(new Error('Redis failed'))

      await createChatRoom(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO chat_rooms (name, room_id) VALUES ($1, $2) RETURNING id, name, room_id;`,
        [req.body.name, expect.any(String)]
      )
      expect(storeRoomsToRedis).toHaveBeenCalledWith({
        room_id: 'uuid-v4',
        name: 'New Chat Room',
      })
      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(next.mock.calls[0][0].message).toBe('Redis failed')
    })
  })

  describe('messageValidationCheck Middleware', () => {
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
    })

    it('should call next with no arguments if validation passes', async () => {
      messageValidationSchema.validate.mockResolvedValueOnce()

      const req = mockReq({
        message: 'validMessage',
        from: 'senderId',
        recipient_id: 'recipientId',
        recipient_type: 'recipientType',
      })

      await messageValidationCheck(req, res, next)

      expect(messageValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith()
    })

    it('should call next with CustomError if validation fails', async () => {
      const validationError = new Error('Validation failed')
      messageValidationSchema.validate.mockRejectedValueOnce(validationError)

      const req = mockReq({
        message: 'validMessage',
        from: null,
        recipient_id: 'recipientId',
        recipient_type: 'recipientType',
      })

      await messageValidationCheck(req, res, next)

      expect(messageValidationSchema.validate).toHaveBeenCalledWith(req.body)
      expect(next).toHaveBeenCalledWith(expect.any(CustomError))
      expect(next.mock.calls[0][0].statusCode).toBe(422)
      expect(next.mock.calls[0][0].message).toBe('Invalid message data')
    })
  })

  describe('createMessage Middleware', () => {
    const { pool } = require('../../config')
    let res, next

    beforeEach(() => {
      res = mockRes()
      next = mockNext
      jest.clearAllMocks()
    })

    it('should create a message and return the message details', async () => {
      const req = mockReq({
        message: 'Hello!',
        from: 'user1',
        recipient_id: 'user2',
        recipient_type: 'user',
      })

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            content: 'Hello!',
            message_id: 'uuid-v4',
            creation_time: 'hh:mm',
          },
        ],
      })

      await createMessage(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO messages (content, message_id, sender_id, recipient_id, recipient_type, creation_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING content, message_id, creation_time;`,
        [
          req.body.message,
          expect.any(String),
          req.body.from,
          req.body.recipient_id,
          req.body.recipient_type,
          expect.any(String),
        ]
      )
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({
        success: true,
        message: 'Hello!',
        message_id: 'uuid-v4',
        creation_time: 'hh:mm',
      })
    })

    it('should call next with an error if query fails', async () => {
      const req = mockReq({
        message: 'Hello!',
        from: 'user1',
        recipient_id: 'user2',
        recipient_type: 'user',
      })

      pool.query.mockRejectedValueOnce(new Error('Query failed'))

      await createMessage(req, res, next)

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO messages (content, message_id, sender_id, recipient_id, recipient_type, creation_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING content, message_id, creation_time;`,
        [
          req.body.message,
          expect.any(String),
          req.body.from,
          req.body.recipient_id,
          req.body.recipient_type,
          expect.any(String),
        ]
      )
      expect(res.status).not.toHaveBeenCalled()
      expect(res.send).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(next.mock.calls[0][0].message).toBe('Query failed')
    })
  })
})

afterAll(() => {
  const { redisClient } = require('../../redis')
  redisClient.quit()
})
