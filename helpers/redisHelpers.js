const redisClient = require('../redis')

const storeUserToRedis = async (user) => {
  await redisClient.hset(
    `user:${user.user_id}`,
    'id',
    user.user_id,
    'username',
    user.username
  )
}

const storeUsersToRedis = async (user) => {
  await redisClient.rpush(
    'usersList',
    JSON.stringify({ id: user.user_id, username: user.username })
  )
}

const storeRoomsToRedis = async (room) => {
  await redisClient.rpush(
    'roomsList',
    JSON.stringify({ id: room.room_id, name: room.name })
  )
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

const incrementAndExpire = async (ip, seconds) => {
  const response = await redisClient.multi().incr(ip).expire(ip, seconds).exec()
  return response
}

const setUserOnlineStatus = async (userid, isConnected) => {
  const response = await redisClient.hset(
    `user:${userid}`,
    'connected',
    isConnected
  )
  return response
}

const getAllUsers = async () => {
  const response = await redisClient.lrange('usersList', 0, -1)
  return response
}

const getAllRooms = async () => {
  const response = await redisClient.lrange('roomsList', 0, -1)
  return response
}

const getLastMessages = async (howMany, userid) => {
  const response = await redisClient.lrange(`messages:${userid}`, 0, howMany)
  return response
}

const setMessage = async (recipientid, messageString) => {
  const response = await redisClient.lpush(
    `messages:${recipientid}`,
    messageString
  )
  return response
}

const setLastSeenMessage = async (userOne, userTwo, messageId) => {
  const response = await redisClient.hset(
    `lastSeenMessage:${userOne}`,
    `chat:${userTwo}`,
    messageId
  )
  return response
}

const getLastSeenMessage = async (userOne, userTwo) => {
  const response = await redisClient.hget(
    `lastSeenMessage:${userOne}`,
    `chat:${userTwo}`
  )
  return response
}

module.exports = {
  getLastSeenMessage,
  setLastSeenMessage,
  setMessage,
  getLastMessages,
  getAllRooms,
  getAllUsers,
  storeUserToRedis,
  storeUsersToRedis,
  storeRoomsToRedis,
  parseUserList,
  parseRoomList,
  incrementAndExpire,
  setUserOnlineStatus,
}
