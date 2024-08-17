const jwt = require('jsonwebtoken')
require('dotenv').config()

const redisClient = require('../redis')
const { parseUserList, parseRoomList } = require('../helpers/redisHelpers')

const verifySocketUser = async (socket, next) => {
  const token = socket.handshake.auth.token
  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          reject(err)
        } else {
          resolve(decoded)
        }
      })
    })

    socket.user = { ...decoded }
    next()
  } catch (err) {
    next(err)
  }
}

const setUpUser = async (socket) => {
  socket.join(socket.user.userid)
  await redisClient.hset(`user:${socket.user.userid}`, 'connected', true)
  const usersList = await redisClient.lrange('usersList', 0, -1)
  const parsedUserList = await parseUserList(usersList)
  const userRooms = parsedUserList.map((user) => user.userid)

  if (userRooms.length > 0)
    socket.to(userRooms).emit('connected', true, socket.user.userid)

  const roomsList = await redisClient.lrange('roomsList', 0, -1)
  const parsedRoomList = await parseRoomList(roomsList)

  socket.emit('users', parsedUserList)
  socket.emit('rooms', parsedRoomList)

  const messages = await redisClient.lrange(
    `messages:${socket.user.userid}`,
    0,
    10
  )

  const parsedMessages = messages.map((message) => {
    const parsedMessage = message.split('.')
    return {
      recipient_id: parsedMessage[0],
      from: parsedMessage[1],
      content: parsedMessage[2],
      message_id: parsedMessage[3],
      status: parsedMessage[4],
      creation_time: parsedMessage[6],
    }
  })

  if (parsedMessages && parsedMessages.length > 0) {
    socket.emit('messages', parsedMessages)
  }
}

const onDisconnection = async (socket) => {
  await redisClient.hset(`user:${socket.user.userid}`, 'connected', false)
  const usersList = await redisClient.lrange('usersList', 0, -1)
  const parsedUserList = await parseUserList(usersList)
  const userRooms = parsedUserList.map((user) => user.userid)

  if (userRooms.length > 0)
    socket.to(userRooms).emit('connected', false, socket.user.userid)
}

const sendMessage = async (socket, message) => {
  try {
    const messageString = [
      message.recipient_id,
      message.from,
      message.content,
      message.message_id,
      'delivered',
      message.recipient_type,
      message.creation_time,
    ].join('.')

    await redisClient.lpush(`messages:${message.recipient_id}`, messageString)
    await redisClient.lpush(`messages:${message.from}`, messageString)

    socket.to(message.recipient_id).emit('sendMessage', message)
  } catch (error) {
    console.log(error)
  }
}

const joinRoom = async (socket, data) => {
  if (data.previousRoom) {
    socket.leave(data.previousRoom)
  }
  if (data.newRoom) {
    socket.join(data.newRoom)

    const messages = await redisClient.lrange(`messages:${data.newRoom}`, 0, 5)

    const parsedMessages = messages.map((message) => {
      const parsedMessage = message.split('.')

      return {
        recipient_id: parsedMessage[0],
        content: parsedMessage[2],
        message_id: parsedMessage[3],
        status: parsedMessage[4],
        from: parsedMessage[1],
        creation_time: parsedMessage[6],
      }
    })
    if (parsedMessages && parsedMessages.length > 0) {
      socket.emit('roomMessages', parsedMessages)
    }
  }
}

const lastSeenMessage = async (socket, data) => {
  await redisClient.hset(
    `lastSeenMessage:${socket.user.userid}`,
    `chat:${data.userid}`,
    data.lastSeenMessage
  )
  const lastSeenMessage = await redisClient.hget(
    `lastSeenMessage:${data.userid}`,
    `chat:${socket.user.userid}`
  )
  if (!lastSeenMessage) {
    await redisClient.hset(
      `lastSeenMessage:${data.userid}`,
      `chat:${socket.user.userid}`,
      '0'
    )
  }
  socket.emit('messagesRead', lastSeenMessage || '0')
  socket.to(data.userid).emit('seen', socket.user.userid)
}

const messageSeen = async (socket, data) => {
  await redisClient.hset(
    `lastSeenMessage:${socket.user.userid}`,
    `chat:${data.userid}`,
    data.messageid
  )
  socket.to(data.userid).emit('messageSeen', true)
}

module.exports = {
  verifySocketUser,
  setUpUser,
  onDisconnection,
  sendMessage,
  joinRoom,
  lastSeenMessage,
  messageSeen,
}
