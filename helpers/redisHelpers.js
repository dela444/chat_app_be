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

module.exports = {
  storeUserToRedis,
  storeUsersToRedis,
  storeRoomsToRedis,
  parseUserList,
  parseRoomList,
}
