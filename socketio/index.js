const jwt = require('jsonwebtoken')
require('dotenv').config()

const redisClient = require('../redis')

const verifySocketUser = (socket, next) => {
  const token = socket.handshake.auth.token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      next(err)
      return
    } else {
      socket.user = { ...decoded }
      next()
    }
  })
}

const parseUserList = async (userList) => {
  const newUserList = []
  for (let user of userList) {
    if (typeof user === 'string') {
      const parsedUser = JSON.parse(user)
      const userConnected = await redisClient.hget(
        `user:${parsedUser.id}`,
        'connected'
      )
      newUserList.push({
        username: parsedUser.username,
        userid: parsedUser.id,
        connected: userConnected,
      })
    }
  }
  return newUserList
}

const parseRoomList = async (roomList) => {
  const newRoomList = []
  for (let room of roomList) {
    if (typeof room === 'string') {
      const parsedRoom = JSON.parse(room)
      newRoomList.push({
        name: parsedRoom.name,
        roomid: parsedRoom.id,
      })
    }
  }
  return newRoomList
}

const setUpUser = async (socket) => {
  socket.join(socket.user.userid)
  await redisClient.hset(
    `user:${socket.user.userid}`,
    'id',
    socket.user.userid,
    'connected',
    true
  )
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
    -1
  )

  const parsedMeessages = messages.map((message) => {
    const parsedMessage = message.split('.')
    return {
      to: parsedMessage[0],
      from: parsedMessage[1],
      content: parsedMessage[2],
    }
  })

  if (parsedMeessages && parsedMeessages.length > 0) {
    socket.emit('messages', parsedMeessages)
  }
}

const onDisconnection = async (socket) => {
  await redisClient.hset(
    `user:${socket.user.userid}`,
    'id',
    socket.user.userid,
    'connected',
    false
  )
  const usersList = await redisClient.lrange('usersList', 0, -1)
  const parsedUserList = await parseUserList(usersList)
  const userRooms = parsedUserList.map((user) => user.userid)

  if (userRooms.length > 0)
    socket.to(userRooms).emit('connected', false, socket.user.userid)
}

const sendMessage = async (socket, message) => {
  const messageString = [message.to, message.from, message.content].join('.')

  await redisClient.lpush(`messages:${message.to}`, messageString)
  await redisClient.lpush(`messages:${message.from}`, messageString)

  socket.to(message.to).emit('sendMessage', message)
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
        to: parsedMessage[0],
        from: parsedMessage[1],
        content: parsedMessage[2],
      }
    })
    if (parsedMessages && parsedMessages.length > 0) {
      socket.emit('roomMessages', parsedMessages)
    }
  }
}

module.exports = {
  verifySocketUser,
  setUpUser,
  onDisconnection,
  sendMessage,
  joinRoom,
}
