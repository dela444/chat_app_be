var express = require('express')
var router = express.Router()

const rateLimiter = require('../helpers/rateLimiter')
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
  rateLimiter(60, 2),
  isUsernameTaken,
  registerUser
)

router.get('/check-auth', isUserAuthenticated)

router.post('/login', userValidationCheck, rateLimiter(60, 5), login)

module.exports = router
