const jwt = require('jsonwebtoken')

const {
  verifySocketUser,
  setUpUser,
  onDisconnection,
  sendMessage,
  lastSeenMessage,
  messageSeen,
  joinRoom,
} = require('../../socketio')
const {
  parseUserList,
  parseRoomList,
  getAllRooms,
  getAllUsers,
  getLastMessages,
  setUserOnlineStatus,
  setMessage,
  setLastSeenMessage,
  getLastSeenMessage,
} = require('../../helpers/redisHelpers')

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}))

jest.mock('../../helpers/redisHelpers', () => ({
  parseUserList: jest.fn(),
  parseRoomList: jest.fn(),
  getAllRooms: jest.fn(),
  getAllUsers: jest.fn(),
  getLastMessages: jest.fn(),
  setUserOnlineStatus: jest.fn(),
  setMessage: jest.fn(),
  setLastSeenMessage: jest.fn(),
  getLastSeenMessage: jest.fn(),
}))

jest.mock('../../redis', () => ({
  redisClient: {
    on: jest.fn(),
    quit: jest.fn(),
    hset: jest.fn(),
    rpush: jest.fn(),
    lrange: jest.fn(),
  },
}))

describe('Socket.io functions tests', () => {
  let socket
  beforeEach(() => {
    socket = {
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      user: { userid: 'user1' },
      leave: jest.fn(),
    }
    jest.clearAllMocks()
  })

  describe('verifySocketUser function', () => {
    let mySocket, next

    beforeEach(() => {
      mySocket = {
        handshake: {
          auth: {
            token: 'validToken',
          },
        },
      }
      next = jest.fn()
    })

    it('should set socket user and call next if token is valid', async () => {
      const decoded = { userid: 1 }
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, decoded)
      })

      await verifySocketUser(mySocket, next)

      expect(mySocket.user).toEqual(decoded)
      expect(next).toHaveBeenCalled()
      expect(next).not.toHaveBeenCalledWith(expect.any(Error))
    })

    it('should call next with an error if token is invalid', async () => {
      const error = new Error('Invalid token')
      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(error)
      })

      await verifySocketUser(mySocket, next)

      expect(next).toHaveBeenCalledWith(error)
    })
  })

  describe('setUpUser function', () => {
    it('should set user status, provide list of users,rooms and user messages', async () => {
      setUserOnlineStatus.mockResolvedValue(true)
      getAllUsers.mockResolvedValueOnce([
        '{"id":"user1","username":"username"}',
      ])
      getAllRooms.mockResolvedValueOnce(['{"id":"room1","name":"roomName"}'])
      getLastMessages.mockResolvedValueOnce(['user1.1.2.3.4.5.6'])
      parseUserList.mockResolvedValue([
        {
          username: 'username',
          userid: 'user1',
          connected: 'true',
        },
      ])
      parseRoomList.mockResolvedValue([
        {
          name: 'roomName',
          roomid: 'room1',
        },
      ])

      await setUpUser(socket)

      expect(socket.join).toHaveBeenCalledWith('user1')
      expect(setUserOnlineStatus).toHaveBeenCalledWith('user1', true)
      expect(getAllUsers).toHaveBeenCalled()
      expect(getAllRooms).toHaveBeenCalled()
      expect(getLastMessages).toHaveBeenCalled()
      expect(parseUserList).toHaveBeenCalledWith([
        '{"id":"user1","username":"username"}',
      ])
      expect(socket.emit).toHaveBeenCalledWith('users', [
        {
          username: 'username',
          userid: 'user1',
          connected: 'true',
        },
      ])
      expect(socket.emit).toHaveBeenCalledWith('rooms', [
        {
          name: 'roomName',
          roomid: 'room1',
        },
      ])
      expect(socket.emit).toHaveBeenCalledWith('messages', [
        {
          recipient_id: 'user1',
          from: '1',
          content: '2',
          message_id: '3',
          status: '4',
          creation_time: '6',
        },
      ])
    })
  })

  describe('onDisconnection function', () => {
    it('should update user status and emit status change to other users', async () => {
      setUserOnlineStatus.mockResolvedValue(true)
      getAllUsers.mockResolvedValueOnce([
        '{"id":"user1","username":"username"}',
        '{"id":"user2","username":"username2"}',
      ])
      parseUserList.mockResolvedValue([
        {
          username: 'username',
          userid: 'user1',
          connected: 'true',
        },
        {
          username: 'username2',
          userid: 'user2',
          connected: 'true',
        },
      ])

      await onDisconnection(socket)

      expect(setUserOnlineStatus).toHaveBeenCalledWith('user1', false)
      expect(getAllUsers).toHaveBeenCalled()
      expect(parseUserList).toHaveBeenCalledWith([
        '{"id":"user1","username":"username"}',
        '{"id":"user2","username":"username2"}',
      ])
      expect(socket.to).toHaveBeenCalledWith(['user1', 'user2'])
      expect(socket.emit).toHaveBeenCalledWith('connected', false, 'user1')
    })
  })

  describe('sendMessage function', () => {
    it('should format message and emit it to recipient', async () => {
      const message = {
        recipient_id: 'user2',
        from: 'user1',
        content: 'Hello!',
        message_id: 'msg123',
        recipient_type: 'user',
        creation_time: 'hh:mm',
      }

      const messageString = [
        message.recipient_id,
        message.from,
        message.content,
        message.message_id,
        'delivered',
        message.recipient_type,
        message.creation_time,
      ].join('.')

      setMessage.mockResolvedValue(true)

      await sendMessage(socket, message)

      expect(setMessage).toHaveBeenCalledWith(
        message.recipient_id,
        messageString
      )
      expect(setMessage).toHaveBeenCalledWith(message.from, messageString)
      expect(socket.to).toHaveBeenCalledWith(message.recipient_id)
      expect(socket.emit).toHaveBeenCalledWith('sendMessage', message)
    })
  })

  describe('joinRoom function', () => {
    it('should join new room, leave previous room and emit room messages', async () => {
      const data = {
        previousRoom: 'room1',
        newRoom: 'room2',
      }

      const messages = [
        'user1.from1.Hello.msg123.delivered.user.20:34',
        'user2.from2.Hi.msg124.delivered.user.02:35',
      ]

      const parsedMessages = [
        {
          recipient_id: 'user1',
          content: 'Hello',
          message_id: 'msg123',
          status: 'delivered',
          from: 'from1',
          creation_time: '20:34',
        },
        {
          recipient_id: 'user2',
          content: 'Hi',
          message_id: 'msg124',
          status: 'delivered',
          from: 'from2',
          creation_time: '02:35',
        },
      ]

      getLastMessages.mockResolvedValue(messages)

      await joinRoom(socket, data)

      expect(socket.leave).toHaveBeenCalledWith(data.previousRoom)
      expect(socket.join).toHaveBeenCalledWith(data.newRoom)
      expect(getLastMessages).toHaveBeenCalledWith(5, data.newRoom)
      expect(socket.emit).toHaveBeenCalledWith('roomMessages', parsedMessages)
    })
  })

  describe('lastSeenMessage function', () => {
    it('should update the last seen message for user1, send user1 the ID of the last message that user2 has read, and notify user2 that user1 has just viewed all their messages', async () => {
      const data = {
        userid: 'user2',
        lastSeenMessage: 'msg123',
      }

      setLastSeenMessage.mockResolvedValue(true)
      getLastSeenMessage.mockResolvedValue('msg123')

      await lastSeenMessage(socket, data)

      expect(setLastSeenMessage).toHaveBeenCalledWith(
        'user1',
        'user2',
        'msg123'
      )
      expect(getLastSeenMessage).toHaveBeenCalledWith('user2', 'user1')
      expect(socket.emit).toHaveBeenCalledWith('messagesRead', 'msg123')
      expect(socket.to).toHaveBeenCalledWith('user2')
      expect(socket.emit).toHaveBeenCalledWith('seen', 'user1')
    })
  })

  describe('messageSeen function', () => {
    it('should update the last seen message for the sender and notify the recipient that the message has been seen', async () => {
      const data = {
        userid: 'user2',
        messageid: 'msg123',
      }

      setLastSeenMessage.mockResolvedValue(true)

      await messageSeen(socket, data)

      expect(setLastSeenMessage).toHaveBeenCalledWith(
        'user1',
        'user2',
        'msg123'
      )

      expect(socket.to).toHaveBeenCalledWith('user2')
      expect(socket.emit).toHaveBeenCalledWith('messageSeen', true)
    })
  })
})

afterAll(() => {
  const { redisClient } = require('../../redis')
  redisClient.quit()
})
