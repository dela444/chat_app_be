var express = require('express')
var router = express.Router()

const {
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom,
  messageValidationCheck,
  createMessage,
} = require('../controllers/chatController')
const rateLimiter = require('../helpers/rateLimiter')

router.post(
  '/create-room',
  roomValidationCheck,
  isRoomNameTaken,
  createChatRoom
)

router.post(
  '/message',
  messageValidationCheck,
  rateLimiter(60, 10),
  createMessage
)

module.exports = router
