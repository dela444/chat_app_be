var express = require('express')
var router = express.Router()

const rateLimiter = require('../controllers/redisController')
const {
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom,
  messageValidationCheck,
  createMessage,
} = require('../controllers/chatController')

router.post(
  '/create-room',
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom
)

router.post(
  '/message',
  messageValidationCheck,
  rateLimiter(60, 10, false),
  createMessage
)

module.exports = router
