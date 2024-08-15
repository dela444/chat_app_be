var express = require('express')
var router = express.Router()

const rateLimiter = require('../controllers/redisController')
const {
  userValidationCheck,
  isUsernameTaken,
  registerUser,
  isUserAuthenticated,
  login,
} = require('../controllers/authController')

router.post(
  '/register',
  userValidationCheck,
  rateLimiter(60, 2, true),
  isUsernameTaken,
  registerUser
)

router.get('/check-auth', isUserAuthenticated)

router.post('/login', userValidationCheck, rateLimiter(60, 5, true), login)

module.exports = router
